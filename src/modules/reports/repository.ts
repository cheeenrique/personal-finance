import { prisma } from "@/lib/db/client";
import { Prisma, type Transaction } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import type { CsvFilterInput } from "./schemas";

export type DateRange = { gte: Date; lte: Date };

export type IncomeExpenseRow = Pick<Transaction, "date" | "type" | "amount">;

export type AccountTypeMovement = { accountId: string; type: string; sum: Prisma.Decimal };

/** Linha bruta do export CSV — nomes já resolvidos via `include` (join na mesma query, sem N+1). */
export type TransactionCsvRow = Transaction & {
  category: { name: string } | null;
  account: { name: string } | null;
  card: { name: string } | null;
};

/**
 * Acesso a dados do módulo reports. SEMPRE escopado por `userId` +
 * `deletedAt: null` (docs/03-DATABASE.md, "Princípio Principal"). Reports são
 * só-leitura — nenhuma função aqui grava dado.
 */

/**
 * Transactions INCOME/EXPENSE de um período, cruas (sem agregação no banco) —
 * insumo do bucket mensal em `service.ts` `incomeVsExpenseByMonth`. Exclui
 * pernas de transferência (`transferId: null`) e `CARD_PAYMENT` (docs/28-REPORTS.md,
 * "Exclusão de Transfer e Pagamento de Fatura"). Considera só pagas.
 * 1 query para o ano inteiro — sem N+1 por mês.
 */
async function listIncomeExpenseInRange(userId: string, range: DateRange): Promise<IncomeExpenseRow[]> {
  return prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      isPaid: true,
      transferId: null,
      type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
      date: { gte: range.gte, lte: range.lte },
    },
    select: { date: true, type: true, amount: true },
  });
}

/** Soma de receita/despesa num período arbitrário — insumo do relatório de fluxo de caixa. */
async function sumIncomeExpenseInRange(
  userId: string,
  range: DateRange,
): Promise<{ income: Prisma.Decimal; expense: Prisma.Decimal }> {
  const rows = await prisma.transaction.groupBy({
    by: ["type"],
    where: {
      userId,
      deletedAt: null,
      isPaid: true,
      transferId: null,
      type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
      date: { gte: range.gte, lte: range.lte },
    },
    _sum: { amount: true },
  });

  const income = rows.find((row) => row.type === TransactionType.INCOME)?._sum.amount ?? new Prisma.Decimal(0);
  const expense = rows.find((row) => row.type === TransactionType.EXPENSE)?._sum.amount ?? new Prisma.Decimal(0);

  return { income, expense };
}

/**
 * Movimentação por conta num período — SEM excluir Transfer/CARD_PAYMENT
 * (regra oposta à de receita/despesa, docs/28-REPORTS.md "Relatório por
 * Conta"). Agrupado por conta+tipo em 1 query, soma por direção acontece em
 * `service.ts`.
 */
async function groupMovementByAccountInRange(
  userId: string,
  range: DateRange,
): Promise<AccountTypeMovement[]> {
  const rows = await prisma.transaction.groupBy({
    by: ["accountId", "type"],
    where: {
      userId,
      deletedAt: null,
      isPaid: true,
      accountId: { not: null },
      date: { gte: range.gte, lte: range.lte },
    },
    _sum: { amount: true },
  });

  return rows
    .filter((row): row is typeof row & { accountId: string } => row.accountId !== null)
    .map((row) => ({ accountId: row.accountId, type: row.type, sum: row._sum.amount ?? new Prisma.Decimal(0) }));
}

async function findAccountNamesByIds(userId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const accounts = await prisma.account.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, name: true },
  });

  return new Map(accounts.map((account) => [account.id, account.name]));
}

function buildCsvWhere(userId: string, filters: CsvFilterInput): Prisma.TransactionWhereInput {
  return {
    userId,
    deletedAt: null,
    ...(filters.type && { type: filters.type }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.accountId && { accountId: filters.accountId }),
    ...(filters.cardId && { cardId: filters.cardId }),
    ...(filters.isPaid !== undefined && { isPaid: filters.isPaid }),
    ...(filters.tagId && { transactionTags: { some: { tagId: filters.tagId } } }),
    ...((filters.dateFrom || filters.dateTo) && {
      date: {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      },
    }),
  };
}

/**
 * Transactions para export CSV — export é sempre completo (sem paginação,
 * docs/28-REPORTS.md "Exportação"), com nomes de categoria/conta/cartão
 * resolvidos via `include` na mesma query (sem N+1). Nenhuma exclusão de
 * Transfer/CARD_PAYMENT — CSV é o extrato bruto, não um KPI.
 */
async function listForCsv(userId: string, filters: CsvFilterInput): Promise<TransactionCsvRow[]> {
  const where = buildCsvWhere(userId, filters);

  return prisma.transaction.findMany({
    where,
    include: {
      category: { select: { name: true } },
      account: { select: { name: true } },
      card: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });
}

export const reportRepository = {
  listIncomeExpenseInRange,
  sumIncomeExpenseInRange,
  groupMovementByAccountInRange,
  findAccountNamesByIds,
  listForCsv,
};
