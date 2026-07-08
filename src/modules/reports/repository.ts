import { prisma } from "@/lib/db/client";
import { Prisma, type Transaction } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import type { CsvFilterInput } from "./schemas";
import type { CashflowFilters, CategoryTotalsFilters } from "./types";

export type DateRange = { gte: Date; lte: Date };

export type IncomeExpenseRow = Pick<Transaction, "date" | "type" | "amount">;

/**
 * Linha crua do Fluxo de Caixa CORRETO (conta-only) — `effectiveDate` é
 * `COALESCE("paidAt", "date")`, mesma regra de caixa do Dashboard
 * (`transactions/repository.ts` `sumAmountByTypeInRange`). Não confundir com
 * `IncomeExpenseRow.date`: aquele insumo alimenta `incomeVsExpenseByMonth`
 * (série histórica por `date`/accrual, ainda usada pela "Evolução mensal" do
 * Dashboard) — mantido intocado de propósito.
 */
export type CashflowRow = { effectiveDate: Date; type: TransactionType; amount: Prisma.Decimal };

export type CategoryTotalRow = { categoryId: string; sum: Prisma.Decimal };

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

/**
 * Condições SQL compartilhadas do Fluxo de Caixa CORRETO (docs/28-REPORTS.md
 * "Exclusão de Transfer e Pagamento de Fatura" + regra de caixa do Dashboard):
 * só conta (`cardId IS NULL`), só paga, sem transferência. `type` restringe a
 * INCOME/EXPENSE só quando o filtro pede um desses dois — outro valor (ou
 * ausência de filtro) inclui os dois tipos (ver `CashflowFilters`, types.ts).
 * `accountId`/`categoryId` narrow quando informados.
 */
function buildCashflowConditions(userId: string, filters: CashflowFilters): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"userId" = ${userId}`,
    Prisma.sql`"deletedAt" IS NULL`,
    Prisma.sql`"isPaid" = true`,
    Prisma.sql`"transferId" IS NULL`,
    Prisma.sql`"cardId" IS NULL`,
  ];

  conditions.push(
    filters.type === TransactionType.INCOME || filters.type === TransactionType.EXPENSE
      ? Prisma.sql`"type" = ${filters.type}::"TransactionType"`
      : Prisma.sql`"type" IN ('INCOME', 'EXPENSE')`,
  );

  if (filters.accountId) conditions.push(Prisma.sql`"accountId" = ${filters.accountId}`);
  if (filters.categoryId) conditions.push(Prisma.sql`"categoryId" = ${filters.categoryId}`);

  return conditions;
}

/**
 * Fluxo de Caixa mês a mês CORRETO (conta-only) — insumo de
 * `reportService.cashflowByMonth` (gráfico "Fluxo de caixa" de `/reports`).
 * Rows crus (sem agregação no banco), bucketizados por mês SP em
 * `service.ts` a partir de `effectiveDate` — mesma técnica de
 * `listIncomeExpenseInRange` (que fica intocada, ver seu comentário).
 */
async function listCashflowByMonthInRange(
  userId: string,
  range: DateRange,
  filters: CashflowFilters = {},
): Promise<CashflowRow[]> {
  const conditions = buildCashflowConditions(userId, filters);
  conditions.push(Prisma.sql`COALESCE("paidAt", "date") >= ${range.gte}`);
  conditions.push(Prisma.sql`COALESCE("paidAt", "date") <= ${range.lte}`);

  return prisma.$queryRaw<CashflowRow[]>`
    SELECT COALESCE("paidAt", "date") AS "effectiveDate", "type", "amount"
    FROM "Transaction"
    WHERE ${Prisma.join(conditions, " AND ")}
  `;
}

/**
 * Soma de receita/despesa CORRETA (conta-only) num período arbitrário —
 * insumo do "Resumo do período" (`reportService.cashflow`). `range` já deve
 * vir com o fim do dia estendido quando o filtro é por `paidAt` (ver
 * `service.ts` `endOfDayInclusive`) — `paidAt` carrega hora real, diferente
 * de `date` (sempre meia-noite).
 */
async function sumCashflowInRange(
  userId: string,
  range: DateRange,
  filters: CashflowFilters = {},
): Promise<{ income: Prisma.Decimal; expense: Prisma.Decimal }> {
  const conditions = buildCashflowConditions(userId, filters);
  conditions.push(Prisma.sql`COALESCE("paidAt", "date") >= ${range.gte}`);
  conditions.push(Prisma.sql`COALESCE("paidAt", "date") <= ${range.lte}`);

  const rows = await prisma.$queryRaw<{ type: TransactionType; total: Prisma.Decimal | string | number }[]>`
    SELECT "type", COALESCE(SUM("amount"), 0) AS total
    FROM "Transaction"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY "type"
  `;

  const income = rows.find((row) => row.type === TransactionType.INCOME)?.total ?? 0;
  const expense = rows.find((row) => row.type === TransactionType.EXPENSE)?.total ?? 0;

  return { income: new Prisma.Decimal(income), expense: new Prisma.Decimal(expense) };
}

/**
 * Totais por categoria num período ARBITRÁRIO — insumo de
 * `reportService.categoryTotals` ("Por categoria" de `/reports` e "Gastos por
 * categoria" do Dashboard). MESMA regra de caixa do KPI "Despesas do mês"
 * (`transactions/repository.ts` `sumAmountByTypeInRange`): só conta (`cardId
 * IS NULL`), sem transferência, só paga, mês pelo MOVIMENTO do dinheiro
 * (`COALESCE("paidAt", "date")`) — sem isso o total divergia do KPI (cartão
 * entrava em dobro com a fatura, e uma parcela paga adiantada contava no mês
 * errado). Cartão já tem sua própria seção ("Por cartão"/fatura), não some do
 * relatório, só não some aqui de novo. Distinto de
 * `transactionRepository.groupExpensesByCategoryInRange` (mês único, sempre
 * EXPENSE, sem filtro extra — intocado porque também alimenta Dashboard
 * (gráfico de pizza histórico) e Telegram): aqui o tipo pode ser INCOME
 * quando o filtro global pede, e o range é o período inteiro selecionado (não
 * só um mês). `groupBy` do Prisma não expressa COALESCE no filtro, daí o
 * `$queryRaw` parametrizado (mesmo motivo de `buildCashflowConditions`
 * abaixo). `range` já deve vir com o fim do dia estendido (ver `service.ts`
 * `endOfDayInclusive`) — `paidAt` carrega hora real, diferente de `date`.
 */
async function groupCategoryTotalsInRange(
  userId: string,
  range: DateRange,
  filters: CategoryTotalsFilters = {},
): Promise<CategoryTotalRow[]> {
  const type = filters.type === TransactionType.INCOME ? TransactionType.INCOME : TransactionType.EXPENSE;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"userId" = ${userId}`,
    Prisma.sql`"deletedAt" IS NULL`,
    Prisma.sql`"isPaid" = true`,
    Prisma.sql`"transferId" IS NULL`,
    Prisma.sql`"cardId" IS NULL`,
    Prisma.sql`"type" = ${type}::"TransactionType"`,
    Prisma.sql`"categoryId" IS NOT NULL`,
    Prisma.sql`COALESCE("paidAt", "date") >= ${range.gte}`,
    Prisma.sql`COALESCE("paidAt", "date") <= ${range.lte}`,
  ];

  if (filters.accountId) conditions.push(Prisma.sql`"accountId" = ${filters.accountId}`);

  const rows = await prisma.$queryRaw<{ categoryId: string; sum: Prisma.Decimal | string | number }[]>`
    SELECT "categoryId", COALESCE(SUM("amount"), 0) AS sum
    FROM "Transaction"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY "categoryId"
  `;

  return rows.map((row) => ({ categoryId: row.categoryId, sum: new Prisma.Decimal(row.sum) }));
}

/**
 * Nomes de categoria por id — mesmo padrão de `findAccountNamesByIds` abaixo
 * (módulos não cross-importam repository um do outro neste projeto, ver
 * `modules/budgets/repository.ts`).
 */
async function findCategoryNamesByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const categories = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });

  return new Map(categories.map((category) => [category.id, category.name]));
}

/**
 * Movimentação por conta num período — SEM excluir Transfer/CARD_PAYMENT
 * (regra oposta à de receita/despesa, docs/28-REPORTS.md "Relatório por
 * Conta"). Agrupado por conta+tipo em 1 query, soma por direção acontece em
 * `service.ts`. `accountId` (opcional) narrow pra uma única conta — filtro
 * "conta" do mapa de filtros globais aplicado na QUERY, não em memória.
 */
async function groupMovementByAccountInRange(
  userId: string,
  range: DateRange,
  accountId?: string,
): Promise<AccountTypeMovement[]> {
  const rows = await prisma.transaction.groupBy({
    by: ["accountId", "type"],
    where: {
      userId,
      deletedAt: null,
      isPaid: true,
      accountId: accountId ?? { not: null },
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
  listCashflowByMonthInRange,
  sumCashflowInRange,
  groupMovementByAccountInRange,
  groupCategoryTotalsInRange,
  findCategoryNamesByIds,
  findAccountNamesByIds,
  listForCsv,
};
