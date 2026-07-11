import { CategoryType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";
import { accountRepository } from "@/modules/accounts/repository";
import { cardRepository } from "@/modules/cards/repository";
import { categoryRepository } from "@/modules/categories/repository";
import { transactionService } from "@/modules/transactions/service";
import { normalizeWord } from "@/modules/telegram/normalize";
import { calendarPartsSP } from "@/lib/date/calendar-sp";
import { parseImportFile } from "./parsers";
import { importRepository, type FallbackRow } from "./repository";
import { AccountNotFoundError, CardNotFoundError } from "./errors";
import type {
  ImportCommitResult,
  ImportParseError,
  ImportPreviewItem,
  ImportPreviewResult,
  ImportTarget,
  ImportTransactionType,
  ParsedTransaction,
} from "./types";

async function assertTargetOwnership(userId: string, target: ImportTarget): Promise<void> {
  if (target.kind === "account") {
    const account = await accountRepository.findById(userId, target.accountId);
    if (!account) throw new AccountNotFoundError(target.accountId);
    return;
  }

  const card = await cardRepository.findById(userId, target.cardId);
  if (!card) throw new CardNotFoundError(target.cardId);
}

/** Genérico em `T` (não fixo em `ParsedTransaction`) — preserva campos extras do chamador (ex.: `categoryId` já resolvido em `commitImport`) no `Array.prototype.filter` narrowing. */
function hasFitId<T extends { fitId: string | null }>(item: T): item is T & { fitId: string } {
  return item.fitId !== null;
}

/**
 * Chave de dedup do fallback sem `fitId` — target-aware (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Fluxo 1"): CONTA usa `(data,valor,descrição)` (mesma regra de sempre, docs/03-DATABASE.md
 * "Importação de Extrato OFX"); CARTÃO usa só `(data,valor)` — fatura de cartão não tem
 * `fitId` NUNCA (diferente do raro caso de conta), e o dono decidiu que 2 compras mesma
 * data/valor na fatura já contam como duplicata (parcela = gasto flat, sem campo extra pra
 * diferenciar). Dia-calendário em America/Sao_Paulo (`calendarPartsSP`), não
 * `date.toISOString()` — mesmo racional do arquivo original.
 *
 * Exportada (só pra teste — `service.test.ts`): função PURA, sem I/O.
 */
export function buildFallbackKey(target: ImportTarget, date: Date, amount: string, description: string): string {
  const { year, month, day } = calendarPartsSP(date);
  const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (target.kind === "card") return `${dayKey}|${amount}`;
  return `${dayKey}|${amount}|${description.trim().toLowerCase()}`;
}

/**
 * Contagem por chave (multiset), não presença booleana — o banco pode já ter
 * N cópias da mesma chave (ex.: 2 lançamentos de "Pix" no mesmo dia, mesmo
 * valor, sem fitId). Um `Set` só saberia dizer "existe ao menos 1"; aqui cada
 * duplicata real do arquivo consome 1 ocorrência da contagem, então N cópias
 * no banco + M no arquivo importam só `max(0, M-N)` (nunca engole item novo
 * como se fosse duplicata da mesma chave, nem duplica além do que o banco já
 * tem).
 */
function buildFallbackKeyCounts(target: ImportTarget, rows: FallbackRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = buildFallbackKey(target, row.date, row.amount, row.description);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Estado de dedup mutável do batch — MESMA instância usada do 1º ao último item do loop (preview ou commit), nunca dois estados separados. */
type DedupState = { fitIds: Set<string>; fallbackCounts: Map<string, number> };

function buildDedupState(target: ImportTarget, existingFitIds: Set<string>, fallbackRows: FallbackRow[]): DedupState {
  return { fitIds: existingFitIds, fallbackCounts: buildFallbackKeyCounts(target, fallbackRows) };
}

/**
 * Único ponto de decisão "é duplicata?" — usado IDÊNTICO por `previewImport`
 * e `commitImport` (nunca podem divergir). Muta `state`: fitId novo entra
 * no Set (pega duplicata do mesmo fitId dentro do MESMO arquivo); chave de
 * fallback duplicada decrementa a contagem (consome 1 ocorrência do banco por
 * item do arquivo que bateu nela — dedup in-batch natural, sem Set à parte).
 */
function isDuplicate(target: ImportTarget, item: ParsedTransaction, state: DedupState): boolean {
  if (item.fitId) {
    if (state.fitIds.has(item.fitId)) return true;
    state.fitIds.add(item.fitId);
    return false;
  }

  const key = buildFallbackKey(target, item.date, item.amount, item.description);
  const remaining = state.fallbackCounts.get(key) ?? 0;
  if (remaining <= 0) return false;

  state.fallbackCounts.set(key, remaining - 1);
  return true;
}

/**
 * Casa o `suggestedCategoryName` da IA (só a fatura manda isso, ver
 * `card-invoice-parser.ts`) contra as categorias REAIS do usuário do MESMO `type`
 * (EXPENSE/INCOME) — match exato por nome, case/acento-insensível (`normalizeWord`, reusado de
 * `modules/telegram/resolve.ts` `resolveCategoryByName`, mesma regra — DRY a partir do 2º caso
 * concreto, ~/.claude/rules/02-dry-kiss-yagni.md). Sem match, `null` — nunca inventa categoria
 * nova a partir do texto solto da IA, só sugere se o usuário já tem uma equivalente.
 */
async function matchCategoryByName(
  userId: string,
  type: ImportTransactionType,
  categoryName: string,
): Promise<{ id: string; name: string } | null> {
  const expectedType = type === "INCOME" ? CategoryType.INCOME : CategoryType.EXPENSE;
  const categories = await categoryRepository.listAll(userId);

  // Match tolerante a plural/singular: a IA sugere no plural ("Seguros", "Assinaturas") e a
  // categoria do usuário costuma ser singular ("Seguro", "Assinatura") — o match exato falhava
  // e mandava "Criar" pra uma categoria que já existe. Compara o nome normalizado E a versão
  // sem "s" final (singularização crua, suficiente pra pt-BR de nome de categoria).
  const singular = (value: string) => value.replace(/s$/, "");
  const targetNorm = normalizeWord(categoryName);
  const targetSing = singular(targetNorm);

  const match = categories.find((category) => {
    if (category.type !== expectedType) return false;
    const catNorm = normalizeWord(category.name);
    return catNorm === targetNorm || singular(catNorm) === targetSing;
  });
  return match ? { id: match.id, name: match.name } : null;
}

/**
 * Categoria sugerida pra prévia — 1) `item.suggestedCategoryName` (IA da fatura) casado contra
 * categoria REAL do usuário (`matchCategoryByName`); 2) sem sugestão ou sem match, cai no
 * histórico de sempre (`transactionService.lastCategoryForDescription`, já existente —
 * reusado, nunca reimplementado); 3) `null` quando nada resolve — jamais inventa categoria
 * (instrução explícita do dono). Preview (`resolveCategoryName`) e commit
 * (`resolveCommitCategoryId`/`resolveCategoryId`) aplicam a MESMA regra de histórico, senão a
 * prévia mostraria uma categoria diferente da que realmente é gravada.
 */
async function resolveCategoryName(
  userId: string,
  type: ImportTransactionType,
  description: string,
  suggestedCategoryName: string | null | undefined,
): Promise<string | null> {
  if (suggestedCategoryName) {
    const matched = await matchCategoryByName(userId, type, suggestedCategoryName);
    if (matched) return matched.name;
  }

  const category = await transactionService.lastCategoryForDescription(userId, description);
  if (category) return category.name;

  // Sem categoria real equivalente nem histórico: surfa a sugestão CRUA da IA (se houver) pro
  // preview oferecer "Criar: <nome>" no select (front detecta que o nome não bate com nenhuma
  // categoria real e pré-seleciona a opção de criar). Ainda não é categoria de verdade — só
  // candidata; o usuário aceita (cria em 1 clique) ou troca. Sem sugestão, `null`.
  return suggestedCategoryName ?? null;
}

async function resolveCategoryId(userId: string, description: string): Promise<string | null> {
  const category = await transactionService.lastCategoryForDescription(userId, description);
  return category?.id ?? null;
}

/**
 * Categoria final gravada no commit — o usuário pode ESCOLHER a categoria de um item na
 * prévia (`item.categoryId`, front manda no commit); se vier um valor não-nulo E ele estiver
 * em `ownedCategoryIds` (pertence ao `userId`, ver `categoryRepository.findOwnedIds`), usa o
 * override. Caso contrário (não veio, veio `null`, ou veio um id de outro usuário) cai no
 * fallback de sempre — histórico por descrição (`resolveCategoryId`). Um `categoryId` que não
 * pertence ao usuário NUNCA é gravado (docs/10-AUTH.md, isolamento por userId) — trata como se
 * não tivesse vindo nada, não é erro de validação (o front não deveria mandar isso, mas o
 * backend não confia).
 */
async function resolveCommitCategoryId(
  userId: string,
  description: string,
  requestedCategoryId: string | null | undefined,
  ownedCategoryIds: Set<string>,
): Promise<string | null> {
  if (requestedCategoryId && ownedCategoryIds.has(requestedCategoryId)) return requestedCategoryId;
  return resolveCategoryId(userId, description);
}

/**
 * Prévia da importação — parseia o arquivo (parser resolvido por extensão,
 * `parsers/index.ts`) e classifica cada transação em novo/duplicado/erro, sem
 * gravar nada (docs/03-DATABASE.md, "Importação de Extrato OFX"; formatos
 * além de OFX em docs/superpowers/specs/2026-07-08-import-multiformato-design.md).
 * Dedup por `fitId` já existente no TARGET; fallback por `(date, amount,
 * description?)` pros itens sem `fitId` (CSV nunca tem; fatura de cartão
 * nunca tem — ver `buildFallbackKey`).
 */
async function previewImport(
  userId: string,
  target: ImportTarget,
  fileName: string,
  fileContent: string,
  password?: string,
): Promise<ImportPreviewResult> {
  await assertTargetOwnership(userId, target);

  const { transactions, errors } = await parseImportFile(
    fileName,
    fileContent,
    target.kind === "card" ? { kind: "card", password } : undefined,
  );

  const withFitId = transactions.filter(hasFitId);
  const withoutFitId = transactions.filter((item) => !hasFitId(item));

  const [existingFitIds, fallbackRows] = await Promise.all([
    importRepository.findExistingFitIds(
      userId,
      target,
      withFitId.map((item) => item.fitId),
    ),
    withoutFitId.length > 0 ? importRepository.findFallbackRows(userId, target) : Promise.resolve([]),
  ]);
  const state = buildDedupState(target, existingFitIds, fallbackRows);

  let duplicados = 0;
  const novosParsed: ParsedTransaction[] = [];

  for (const item of transactions) {
    if (isDuplicate(target, item, state)) {
      duplicados += 1;
      continue;
    }
    novosParsed.push(item);
  }

  const novos: ImportPreviewItem[] = await Promise.all(
    novosParsed.map(async (item) => ({
      date: item.date,
      amount: item.amount,
      type: item.type,
      description: item.description,
      categoryName: await resolveCategoryName(userId, item.type, item.description, item.suggestedCategoryName),
    })),
  );

  return {
    preview: {
      total: transactions.length + errors.length,
      novos,
      duplicados,
      erros: errors,
    },
    transactions,
  };
}

/**
 * Confirma a importação — grava só os itens ainda não existentes no target.
 * Recebe as `transactions` JÁ parseadas pela prévia (`previewImport`), NÃO
 * reparseia o arquivo: PDF é extraído por LLM (`parsers/pdf-parser.ts`), então
 * reparsear no commit gastaria uma 2ª chamada Gemini — lenta e não
 * determinística (o gravado poderia divergir da prévia que o usuário
 * confirmou). As transações chegam do client (produzidas pelo parser do
 * servidor na prévia, revalidadas por `commitImportSchema` na action); isso
 * não amplia poder — o usuário já pode criar lançamentos manuais na própria
 * conta/cartão, e ownership + dedup continuam valendo aqui.
 * Categorização resolvida ANTES do `$transaction` interativo (mantém a janela
 * da transação curta — mesmo cuidado de `modules/cards/pay-invoice.ts`); dedup
 * + insert acontecem dentro dela. Cada item pode chegar com um `categoryId`
 * escolhido pelo usuário na prévia (override) — `resolveCommitCategoryId`
 * valida ownership (1 query pro conjunto de categorias pedidas) antes de usar;
 * sem override válido, cai no histórico de sempre (`resolveCategoryId`).
 * Concorrência (duplo clique no Confirmar): o
 * snapshot de dedup NÃO enxerga inserts ainda não commitados do concorrente
 * (READ COMMITTED) — quem segura é o índice único parcial em (accountId,
 * fitId) + `skipDuplicates` no insert pra CONTA (ver `repository.insertMany` e
 * a migration `transaction_fitid_unique`); cartão não tem essa rede (nunca tem
 * `fitId` — decisão consciente, ver `repository.ts`).
 */
async function commitImport(
  userId: string,
  target: ImportTarget,
  transactions: ParsedTransaction[],
  errors: ImportParseError[],
): Promise<ImportCommitResult> {
  await assertTargetOwnership(userId, target);

  if (transactions.length === 0) return { imported: 0, duplicados: 0, erros: errors };

  const requestedCategoryIds = [...new Set(transactions.flatMap((item) => (item.categoryId ? [item.categoryId] : [])))];
  const ownedCategoryIds = await categoryRepository.findOwnedIds(userId, requestedCategoryIds);

  const withCategory = await Promise.all(
    transactions.map(async (item) => ({
      ...item,
      categoryId: await resolveCommitCategoryId(userId, item.description, item.categoryId, ownedCategoryIds),
    })),
  );

  const { imported, duplicados } = await prisma.$transaction(async (tx) => {
    const withFitId = withCategory.filter(hasFitId);
    const withoutFitId = withCategory.filter((item) => !hasFitId(item));

    const [existingFitIds, fallbackRows] = await Promise.all([
      importRepository.findExistingFitIds(
        userId,
        target,
        withFitId.map((item) => item.fitId),
        tx,
      ),
      withoutFitId.length > 0 ? importRepository.findFallbackRows(userId, target, tx) : Promise.resolve([]),
    ]);
    const state = buildDedupState(target, existingFitIds, fallbackRows);

    // Dedup in-batch: `isDuplicate` muta `state` a cada item — duas
    // transações com o mesmo `fitId` (ou a mesma chave de fallback, até o
    // limite do que o banco já tem) no MESMO arquivo inserem só o necessário.
    // O snapshot do banco não enxerga o que ainda está no próprio batch.
    const toInsert = withCategory.filter((item) => !isDuplicate(target, item, state));
    const insertedCount = await importRepository.insertMany(userId, target, toInsert, tx);

    // `insertedCount < toInsert.length` acontece sob commit concorrente: o
    // índice único parcial + `skipDuplicates` descartam o que o outro commit
    // gravou primeiro — essa diferença também é duplicata, não erro.
    return { imported: insertedCount, duplicados: withCategory.length - insertedCount };
  });

  return { imported, duplicados, erros: errors };
}

export const importService = {
  previewImport,
  commitImport,
};
