import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import type { TransactionType } from "@/generated/prisma/enums";

/** Client Prisma padrão ou escopado a uma `$transaction` interativa (mesmo padrão de `modules/cards/repository.ts`, ver service.ts `commitOfxImport`). */
type Db = Prisma.TransactionClient;

export type CommitItem = {
  fitId: string | null;
  date: Date;
  amount: string;
  type: TransactionType;
  description: string;
  categoryId: string | null;
};

/** Transaction sem `fitId` de uma conta — insumo do dedup por fallback (ver service.ts). */
export type FallbackRow = { date: Date; amount: string; description: string };

/**
 * Acesso a dados do módulo imports. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (docs/03-DATABASE.md,
 * "Princípio Principal": isolamento total por usuário).
 */

/** `fitId`s já existentes (não deletados) nesta conta, dentre os informados — insumo do dedup (ver service.ts `previewOfxImport`/`commitOfxImport`). */
async function findExistingFitIds(
  userId: string,
  accountId: string,
  fitIds: string[],
  db: Db = prisma,
): Promise<Set<string>> {
  if (fitIds.length === 0) return new Set();

  const rows = await db.transaction.findMany({
    where: { userId, accountId, deletedAt: null, fitId: { in: fitIds } },
    select: { fitId: true },
  });

  return new Set(rows.flatMap((row) => (row.fitId ? [row.fitId] : [])));
}

/**
 * Transactions SEM `fitId` desta conta — insumo do dedup de fallback (raro
 * caso de `<STMTTRN>` sem `<FITID>` no arquivo, docs/03-DATABASE.md,
 * "Importação de Extrato OFX"). Conjunto pequeno na prática — sem paginação.
 */
async function findFallbackRows(userId: string, accountId: string, db: Db = prisma): Promise<FallbackRow[]> {
  const rows = await db.transaction.findMany({
    where: { userId, accountId, deletedAt: null, fitId: null },
    select: { date: true, amount: true, description: true },
  });

  return rows.map((row) => ({ date: row.date, amount: row.amount.toString(), description: row.description }));
}

/** Insere as N Transactions já filtradas (sem duplicatas) — `isPaid` sempre `true` (docs/20-TRANSACTIONS.md: compra normal nasce paga). */
async function insertMany(userId: string, accountId: string, items: CommitItem[], db: Db = prisma): Promise<number> {
  if (items.length === 0) return 0;

  const result = await db.transaction.createMany({
    data: items.map((item) => ({
      userId,
      accountId,
      description: item.description,
      type: item.type,
      amount: item.amount,
      categoryId: item.categoryId,
      date: item.date,
      isPaid: true,
      fitId: item.fitId,
    })),
  });

  return result.count;
}

export const importRepository = {
  findExistingFitIds,
  findFallbackRows,
  insertMany,
};
