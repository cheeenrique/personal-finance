import { prisma } from "@/lib/db/client";
import { accountRepository } from "@/modules/accounts/repository";
import { transactionService } from "@/modules/transactions/service";
import { parseOfx } from "./ofx-parser";
import { importRepository, type FallbackRow } from "./repository";
import { AccountNotFoundError } from "./errors";
import type { OfxImportCommitResult, OfxImportPreview, OfxPreviewItem, ParsedOfxTransaction } from "./types";

async function assertAccountOwnership(userId: string, accountId: string): Promise<void> {
  const account = await accountRepository.findById(userId, accountId);
  if (!account) throw new AccountNotFoundError(accountId);
}

/** Genérico em `T` (não fixo em `ParsedOfxTransaction`) — preserva campos extras do chamador (ex.: `categoryId` já resolvido em `commitOfxImport`) no `Array.prototype.filter` narrowing. */
function hasFitId<T extends { fitId: string | null }>(item: T): item is T & { fitId: string } {
  return item.fitId !== null;
}

/**
 * Chave de dedup do fallback sem `fitId` (docs/03-DATABASE.md, "Importação de
 * Extrato OFX") — mesma regra dos dois lados (linha existente no banco vs.
 * item recém-parseado). CONTRATO: `amount` sempre normalizado como
 * `Decimal.toFixed(2)` ("50.00", nunca "50" ou "50.1") — o parser garante em
 * `parseOfxAmount`, o repository em `findFallbackRows`. Formato divergente
 * entre os lados quebra a chave e duplica tudo sem fitId no reimport.
 */
function fallbackKey(date: Date, amount: string, description: string): string {
  return `${date.toISOString()}|${amount}|${description.trim().toLowerCase()}`;
}

function buildFallbackKeySet(rows: FallbackRow[]): Set<string> {
  return new Set(rows.map((row) => fallbackKey(row.date, row.amount, row.description)));
}

function isDuplicate(
  item: ParsedOfxTransaction,
  existingFitIds: Set<string>,
  existingFallbackKeys: Set<string>,
): boolean {
  return item.fitId
    ? existingFitIds.has(item.fitId)
    : existingFallbackKeys.has(fallbackKey(item.date, item.amount, item.description));
}

/**
 * Categoria sugerida por descrição (`transactionService.lastCategoryForDescription`,
 * já existente — reusado, nunca reimplementado). `null` quando não há
 * histórico — jamais inventa categoria (instrução explícita do dono).
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
 * Prévia da importação — parseia o arquivo e classifica cada `<STMTTRN>` em
 * novo/duplicado/erro, sem gravar nada (docs/03-DATABASE.md, "Importação de
 * Extrato OFX"). Dedup por `fitId` já existente na CONTA; fallback por
 * `(date, amount, description)` só para o raro item sem `fitId`.
 */
async function previewOfxImport(userId: string, accountId: string, fileContent: string): Promise<OfxImportPreview> {
  await assertAccountOwnership(userId, accountId);

  const { transactions, errors } = parseOfx(fileContent);

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
  const existingFallbackKeys = buildFallbackKeySet(fallbackRows);

  let duplicados = 0;
  const novosParsed: ParsedOfxTransaction[] = [];

  for (const item of transactions) {
    if (isDuplicate(item, existingFitIds, existingFallbackKeys)) {
      duplicados += 1;
      continue;
    }
    novosParsed.push(item);
    // Dedup in-batch: alimenta o Set durante o loop pra dois `<STMTTRN>` com o
    // mesmo `<FITID>` no MESMO arquivo contarem como 1 novo + 1 duplicado
    // (mesma regra do commit — preview e commit nunca podem divergir).
    if (item.fitId) existingFitIds.add(item.fitId);
  }

  const novos: OfxPreviewItem[] = await Promise.all(
    novosParsed.map(async (item) => ({
      date: item.date,
      amount: item.amount,
      type: item.type,
      description: item.description,
      categoryName: await resolveCategoryName(userId, item.description),
    })),
  );

  return {
    total: transactions.length + errors.length,
    novos,
    duplicados,
    erros: errors,
  };
}

/**
 * Confirma a importação — reparseia o arquivo (idempotente: sem estado
 * guardado entre preview e commit) e grava só os itens ainda não existentes
 * na conta. Categorização resolvida ANTES do `$transaction` interativo
 * (mantém a janela da transação curta — mesmo cuidado de
 * `modules/cards/pay-invoice.ts`); dedup + insert acontecem dentro dela.
 * Concorrência (duplo clique no Confirmar): o snapshot de dedup NÃO enxerga
 * inserts ainda não commitados do concorrente (READ COMMITTED) — quem segura
 * é o índice único parcial em (accountId, fitId) + `skipDuplicates` no insert
 * (ver `repository.insertMany` e a migration `transaction_fitid_unique`).
 */
async function commitOfxImport(userId: string, accountId: string, fileContent: string): Promise<OfxImportCommitResult> {
  await assertAccountOwnership(userId, accountId);

  const { transactions, errors } = parseOfx(fileContent);
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
    const existingFallbackKeys = buildFallbackKeySet(fallbackRows);

    // Dedup in-batch: alimenta o Set durante o filter pra dois `<STMTTRN>` com
    // o mesmo `<FITID>` no MESMO arquivo inserirem só o 1º — o snapshot do
    // banco não enxerga o que ainda está no próprio batch.
    const toInsert = withCategory.filter((item) => {
      if (isDuplicate(item, existingFitIds, existingFallbackKeys)) return false;
      if (item.fitId) existingFitIds.add(item.fitId);
      return true;
    });
    const insertedCount = await importRepository.insertMany(userId, accountId, toInsert, tx);

    // `insertedCount < toInsert.length` acontece sob commit concorrente: o
    // índice único parcial + `skipDuplicates` descartam o que o outro commit
    // gravou primeiro — essa diferença também é duplicata, não erro.
    return { imported: insertedCount, duplicados: withCategory.length - insertedCount };
  });

  return { imported, duplicados, erros: errors };
}

export const importService = {
  previewOfxImport,
  commitOfxImport,
};
