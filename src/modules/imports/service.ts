import { prisma } from "@/lib/db/client";
import { accountRepository } from "@/modules/accounts/repository";
import { transactionService } from "@/modules/transactions/service";
import { calendarPartsSP } from "@/lib/date/calendar-sp";
import { parseImportFile } from "./parsers";
import { importRepository, type FallbackRow } from "./repository";
import { AccountNotFoundError } from "./errors";
import type {
  ImportCommitResult,
  ImportParseError,
  ImportPreviewItem,
  ImportPreviewResult,
  ParsedTransaction,
} from "./types";

async function assertAccountOwnership(userId: string, accountId: string): Promise<void> {
  const account = await accountRepository.findById(userId, accountId);
  if (!account) throw new AccountNotFoundError(accountId);
}

/** Genérico em `T` (não fixo em `ParsedTransaction`) — preserva campos extras do chamador (ex.: `categoryId` já resolvido em `commitImport`) no `Array.prototype.filter` narrowing. */
function hasFitId<T extends { fitId: string | null }>(item: T): item is T & { fitId: string } {
  return item.fitId !== null;
}

/**
 * Chave de dedup do fallback sem `fitId` (docs/03-DATABASE.md, "Importação de
 * Extrato OFX") — mesma regra dos dois lados (linha existente no banco vs.
 * item recém-parseado). Dia-calendário em America/Sao_Paulo (`calendarPartsSP`,
 * não `date.toISOString()`): a mesma transação pode existir no banco com hora
 * diferente do que o parser produz (todo parser em `parsers/*.ts` nasce à
 * meia-noite SP) — comparar o instante exato deixava passar duplicata real
 * (bug: extrato Nubank conta/Pix sem `<FITID>`). CONTRATO: `amount` sempre
 * normalizado como `Decimal.toFixed(2)` ("50.00", nunca "50" ou "50.1") — cada
 * parser garante isso (`parseOfxAmount`/`parseCsvAmount`), o repository em
 * `findFallbackRows`. Formato divergente entre os lados quebra a chave e
 * duplica tudo sem fitId no reimport.
 */
function fallbackKey(date: Date, amount: string, description: string): string {
  const { year, month, day } = calendarPartsSP(date);
  return `${year}-${month}-${day}|${amount}|${description.trim().toLowerCase()}`;
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
function buildFallbackKeyCounts(rows: FallbackRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = fallbackKey(row.date, row.amount, row.description);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Estado de dedup mutável do batch — MESMA instância usada do 1º ao último item do loop (preview ou commit), nunca dois estados separados. */
type DedupState = { fitIds: Set<string>; fallbackCounts: Map<string, number> };

function buildDedupState(existingFitIds: Set<string>, fallbackRows: FallbackRow[]): DedupState {
  return { fitIds: existingFitIds, fallbackCounts: buildFallbackKeyCounts(fallbackRows) };
}

/**
 * Único ponto de decisão "é duplicata?" — usado IDÊNTICO por `previewImport`
 * e `commitImport` (nunca podem divergir). Muta `state`: fitId novo entra
 * no Set (pega duplicata do mesmo fitId dentro do MESMO arquivo); chave de
 * fallback duplicada decrementa a contagem (consome 1 ocorrência do banco por
 * item do arquivo que bateu nela — dedup in-batch natural, sem Set à parte).
 */
function isDuplicate(item: ParsedTransaction, state: DedupState): boolean {
  if (item.fitId) {
    if (state.fitIds.has(item.fitId)) return true;
    state.fitIds.add(item.fitId);
    return false;
  }

  const key = fallbackKey(item.date, item.amount, item.description);
  const remaining = state.fallbackCounts.get(key) ?? 0;
  if (remaining <= 0) return false;

  state.fallbackCounts.set(key, remaining - 1);
  return true;
}

/**
 * Categoria sugerida por descrição — `transactionService.
 * lastCategoryForDescription` (já existente — reusado, nunca reimplementado).
 * `null` quando o histórico não resolve — jamais inventa categoria (instrução
 * explícita do dono). Preview (`resolveCategoryName`) e commit
 * (`resolveCategoryId`) aplicam a MESMA regra, senão a prévia mostraria uma
 * categoria diferente da que realmente é gravada.
 */
async function resolveCategoryName(userId: string, description: string): Promise<string | null> {
  const category = await transactionService.lastCategoryForDescription(userId, description);
  return category?.name ?? null;
}

async function resolveCategoryId(userId: string, description: string): Promise<string | null> {
  const category = await transactionService.lastCategoryForDescription(userId, description);
  return category?.id ?? null;
}

/**
 * Prévia da importação — parseia o arquivo (parser resolvido por extensão,
 * `parsers/index.ts`) e classifica cada transação em novo/duplicado/erro, sem
 * gravar nada (docs/03-DATABASE.md, "Importação de Extrato OFX"; formatos
 * além de OFX em docs/superpowers/specs/2026-07-08-import-multiformato-design.md).
 * Dedup por `fitId` já existente na CONTA; fallback por `(date, amount,
 * description)` pros itens sem `fitId` (CSV nunca tem).
 */
async function previewImport(
  userId: string,
  accountId: string,
  fileName: string,
  fileContent: string,
): Promise<ImportPreviewResult> {
  await assertAccountOwnership(userId, accountId);

  const { transactions, errors } = await parseImportFile(fileName, fileContent);

  const withFitId = transactions.filter(hasFitId);
  const withoutFitId = transactions.filter((item) => !hasFitId(item));

  const [existingFitIds, fallbackRows] = await Promise.all([
    importRepository.findExistingFitIds(
      userId,
      accountId,
      withFitId.map((item) => item.fitId),
    ),
    withoutFitId.length > 0 ? importRepository.findFallbackRows(userId, accountId) : Promise.resolve([]),
  ]);
  const state = buildDedupState(existingFitIds, fallbackRows);

  let duplicados = 0;
  const novosParsed: ParsedTransaction[] = [];

  for (const item of transactions) {
    if (isDuplicate(item, state)) {
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
      categoryName: await resolveCategoryName(userId, item.description),
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
 * Confirma a importação — grava só os itens ainda não existentes na conta.
 * Recebe as `transactions` JÁ parseadas pela prévia (`previewImport`), NÃO
 * reparseia o arquivo: PDF é extraído por LLM (`parsers/pdf-parser.ts`), então
 * reparsear no commit gastaria uma 2ª chamada Gemini — lenta e não
 * determinística (o gravado poderia divergir da prévia que o usuário
 * confirmou). As transações chegam do client (produzidas pelo parser do
 * servidor na prévia, revalidadas por `commitImportSchema` na action); isso
 * não amplia poder — o usuário já pode criar lançamentos manuais na própria
 * conta, e ownership + dedup continuam valendo aqui.
 * Categorização resolvida ANTES do `$transaction` interativo (mantém a janela
 * da transação curta — mesmo cuidado de `modules/cards/pay-invoice.ts`); dedup
 * + insert acontecem dentro dela. Concorrência (duplo clique no Confirmar): o
 * snapshot de dedup NÃO enxerga inserts ainda não commitados do concorrente
 * (READ COMMITTED) — quem segura é o índice único parcial em (accountId,
 * fitId) + `skipDuplicates` no insert (ver `repository.insertMany` e a
 * migration `transaction_fitid_unique`).
 */
async function commitImport(
  userId: string,
  accountId: string,
  transactions: ParsedTransaction[],
  errors: ImportParseError[],
): Promise<ImportCommitResult> {
  await assertAccountOwnership(userId, accountId);

  if (transactions.length === 0) return { imported: 0, duplicados: 0, erros: errors };

  const withCategory = await Promise.all(
    transactions.map(async (item) => ({
      ...item,
      categoryId: await resolveCategoryId(userId, item.description),
    })),
  );

  const { imported, duplicados } = await prisma.$transaction(async (tx) => {
    const withFitId = withCategory.filter(hasFitId);
    const withoutFitId = withCategory.filter((item) => !hasFitId(item));

    const [existingFitIds, fallbackRows] = await Promise.all([
      importRepository.findExistingFitIds(
        userId,
        accountId,
        withFitId.map((item) => item.fitId),
        tx,
      ),
      withoutFitId.length > 0 ? importRepository.findFallbackRows(userId, accountId, tx) : Promise.resolve([]),
    ]);
    const state = buildDedupState(existingFitIds, fallbackRows);

    // Dedup in-batch: `isDuplicate` muta `state` a cada item — duas
    // transações com o mesmo `fitId` (ou a mesma chave de fallback, até o
    // limite do que o banco já tem) no MESMO arquivo inserem só o necessário.
    // O snapshot do banco não enxerga o que ainda está no próprio batch.
    const toInsert = withCategory.filter((item) => !isDuplicate(item, state));
    const insertedCount = await importRepository.insertMany(userId, accountId, toInsert, tx);

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
