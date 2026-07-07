import { prisma } from "@/lib/db/client";
import { Prisma, type Category } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import type {
  TransactionWithTags,
  TransactionSort,
  Transaction,
  RecentTransactionRow,
  InstallmentPurchaseRow,
} from "./types";

export type CreateTransactionData = {
  description: string;
  type: TransactionType;
  amount: string;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  date: Date;
  notes: string | null;
  isPaid: boolean;
  tagIds: string[];
};

export type UpdateTransactionData = Partial<Omit<CreateTransactionData, "tagIds">> & {
  tagIds?: string[];
  /** Derivado da transição de `isPaid` — sempre resolvido pelo service (`resolvePaidAtOnUpdate`), nunca repassado cru do caller. */
  paidAt?: Date | null;
};

export type TransactionListFilter = {
  search?: string;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  cardId?: string;
  tagId?: string;
  isPaid?: boolean;
  /**
   * `type=TRANSFER` nunca é persistido (docs/20-TRANSACTIONS.md,
   * "Transferência") — as 2 pernas nascem EXPENSE/INCOME com `transferId`
   * preenchido. Filtro "Transferência" na UI usa este campo em vez de `type`.
   */
  isTransfer?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: string;
  amountMax?: string;
};

export type TransactionListPage = {
  page: number;
  pageSize: number;
  sort: TransactionSort;
};

export type ExpenseCategoryGroup = { categoryId: string | null; sum: Prisma.Decimal };

const TAG_INCLUDE = { transactionTags: true } as const;

/**
 * Acesso a dados do módulo transactions. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

async function findById(userId: string, id: string): Promise<TransactionWithTags | null> {
  return prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    include: TAG_INCLUDE,
  });
}

/** Só para o fluxo de undo — busca uma transação JÁ soft-deletada (ver `restore`). */
async function findDeletedById(userId: string, id: string): Promise<TransactionWithTags | null> {
  return prisma.transaction.findFirst({
    where: { id, userId, NOT: { deletedAt: null } },
    include: TAG_INCLUDE,
  });
}

async function create(userId: string, data: CreateTransactionData): Promise<TransactionWithTags> {
  return prisma.transaction.create({
    data: {
      userId,
      description: data.description,
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      accountId: data.accountId,
      cardId: data.cardId,
      date: data.date,
      notes: data.notes,
      isPaid: data.isPaid,
      transactionTags:
        data.tagIds.length > 0 ? { create: data.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    include: TAG_INCLUDE,
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * transação de outro usuário mesmo sabendo o `id` (docs/10-AUTH.md, "Regra
 * Principal de Segurança"). Quando `tagIds` é enviado, substitui o conjunto
 * inteiro (deleteMany + create) — não faz merge incremental.
 */
async function update(
  userId: string,
  id: string,
  data: UpdateTransactionData,
): Promise<TransactionWithTags | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.transaction.update({
    where: { id },
    data: {
      ...(data.description !== undefined && { description: data.description }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.accountId !== undefined && { accountId: data.accountId }),
      ...(data.cardId !== undefined && { cardId: data.cardId }),
      ...(data.date !== undefined && { date: data.date }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
      ...(data.paidAt !== undefined && { paidAt: data.paidAt }),
      ...(data.tagIds !== undefined && {
        transactionTags: { deleteMany: {}, create: data.tagIds.map((tagId) => ({ tagId })) },
      }),
    },
    include: TAG_INCLUDE,
  });
}

/** Soft delete — nunca remove fisicamente (docs/20-TRANSACTIONS.md, "Soft Delete"). */
async function softDelete(userId: string, id: string): Promise<TransactionWithTags | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
    include: TAG_INCLUDE,
  });
}

/** Undo do soft delete — limpa `deletedAt` (docs/20-TRANSACTIONS.md, "permitir undo"). */
async function restore(userId: string, id: string): Promise<TransactionWithTags | null> {
  const existing = await findDeletedById(userId, id);
  if (!existing) return null;

  return prisma.transaction.update({
    where: { id },
    data: { deletedAt: null },
    include: TAG_INCLUDE,
  });
}

function buildWhere(userId: string, filters: TransactionListFilter): Prisma.TransactionWhereInput {
  return {
    userId,
    deletedAt: null,
    ...(filters.search && { description: { contains: filters.search, mode: "insensitive" } }),
    ...(filters.type && { type: filters.type }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.accountId && { accountId: filters.accountId }),
    ...(filters.cardId && { cardId: filters.cardId }),
    ...(filters.isPaid !== undefined && { isPaid: filters.isPaid }),
    ...(filters.isTransfer === true && { transferId: { not: null } }),
    ...(filters.isTransfer === false && { transferId: null }),
    ...(filters.tagId && { transactionTags: { some: { tagId: filters.tagId } } }),
    ...((filters.dateFrom || filters.dateTo) && {
      date: {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      },
    }),
    ...((filters.amountMin || filters.amountMax) && {
      amount: {
        ...(filters.amountMin && { gte: filters.amountMin }),
        ...(filters.amountMax && { lte: filters.amountMax }),
      },
    }),
  };
}

const SORT_MAP: Record<TransactionSort, Prisma.TransactionOrderByWithRelationInput> = {
  date_desc: { date: "desc" },
  date_asc: { date: "asc" },
  amount_desc: { amount: "desc" },
  amount_asc: { amount: "asc" },
};

/** Única listagem paginada do app (docs/01-STACK.md, "Performance") — findMany + count em paralelo, sem N+1. */
async function list(
  userId: string,
  filters: TransactionListFilter,
  page: TransactionListPage,
): Promise<{ items: TransactionWithTags[]; total: number }> {
  const where = buildWhere(userId, filters);
  const skip = (page.page - 1) * page.pageSize;

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: TAG_INCLUDE,
      orderBy: SORT_MAP[page.sort],
      skip,
      take: page.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total };
}

/** Transação mais recente (por `date`, depois `createdAt`) de um tipo — base do default de cadastro rápido (docs/05-UX_RULES.md). */
async function findMostRecentByType(
  userId: string,
  type: TransactionType,
): Promise<(Transaction & { category: Category | null }) | null> {
  return prisma.transaction.findFirst({
    where: { userId, type, categoryId: { not: null }, deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
}

/**
 * Descrições DISTINTAS do usuário que combinam com `query` (`contains`,
 * case-insensitive) — insumo do autocomplete do campo Descrição (docs/
 * 20-TRANSACTIONS.md). `groupBy` rankeia direto no banco por frequência
 * (`_count` desc) e recência (`_max(date)` desc) — sem dedupe/rank em memória.
 */
async function findDescriptionSuggestions(userId: string, query: string, limit: number): Promise<string[]> {
  const grouped = await prisma.transaction.groupBy({
    by: ["description"],
    where: { userId, deletedAt: null, description: { contains: query, mode: "insensitive" } },
    _count: { description: true },
    _max: { date: true },
    orderBy: [{ _count: { description: "desc" } }, { _max: { date: "desc" } }],
    take: limit,
  });

  return grouped.map((row) => row.description);
}

/**
 * Transação mais recente (por `date`, depois `createdAt`) com uma descrição
 * EXATA — insumo do bônus "pré-preencher categoria" ao escolher uma sugestão
 * do autocomplete de Descrição (mesma regra de `findMostRecentByType`, mas
 * por descrição em vez de tipo).
 */
async function findMostRecentByDescription(
  userId: string,
  description: string,
): Promise<(Transaction & { category: Category | null }) | null> {
  return prisma.transaction.findFirst({
    where: { userId, description, categoryId: { not: null }, deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
}

/**
 * Soma de Transactions por tipo numa janela de datas — insumo dos KPIs
 * mensais (ver service.ts `monthlyExpenseTotal`/`monthlyIncomeTotal`/
 * `monthlyUnpaidExpenseTotal`). Exclui pernas de transferência
 * (`transferId: null`). `isPaid` default `true` (regra dos KPIs de
 * receita/despesa); `monthlyUnpaidExpenseTotal` passa `false` pro bloco
 * "Previsto / A Pagar" (docs/11-DASHBOARD.md).
 */
async function sumAmountByTypeInRange(
  userId: string,
  type: TransactionType,
  range: { gte: Date; lt: Date },
  isPaid = true,
): Promise<Prisma.Decimal> {
  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      deletedAt: null,
      isPaid,
      type,
      transferId: null,
      // KPIs mensais são FLUXO DE CAIXA (conta): compra no cartão de crédito é
      // dívida (accrual), não saída de dinheiro — ela entra no caixa quando a
      // fatura é paga (um EXPENSE da conta, "Pagamento de fatura"). Contar as
      // compras do cartão AQUI dobraria com o pagamento da fatura.
      cardId: null,
      date: { gte: range.gte, lt: range.lt },
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? new Prisma.Decimal(0);
}

/** Agrupamento de despesas por categoria numa janela — insumo do gráfico de gastos por categoria. */
async function groupExpensesByCategoryInRange(
  userId: string,
  range: { gte: Date; lt: Date },
): Promise<ExpenseCategoryGroup[]> {
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      deletedAt: null,
      isPaid: true,
      type: TransactionType.EXPENSE,
      transferId: null,
      date: { gte: range.gte, lt: range.lt },
    },
    _sum: { amount: true },
  });

  return rows.map((row) => ({ categoryId: row.categoryId, sum: row._sum.amount ?? new Prisma.Decimal(0) }));
}

async function findCategoryNamesByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const categories = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });

  return new Map(categories.map((category) => [category.id, category.name]));
}

/**
 * `installmentsCount` de um conjunto de `InstallmentPurchase` — insumo do
 * badge "N/total" na listagem de Transactions (docs/23-INSTALLMENTS.md,
 * "Regra de UX Principal"). Escopado por `userId` (isolamento, docs/10-AUTH.md).
 */
async function findInstallmentTotalsByIds(userId: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const purchases = await prisma.installmentPurchase.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, installmentsCount: true },
  });

  return new Map(purchases.map((purchase) => [purchase.id, purchase.installmentsCount]));
}

/**
 * Preview do Dashboard (docs/11-DASHBOARD.md, "Últimas Transações") — resolve
 * nome de categoria/conta/cartão e dados de parcelamento direto no `select`,
 * sem N+1. Não reaproveita `TAG_INCLUDE`/`list`: essa tela não precisa de
 * tags, mas precisa de nomes já resolvidos (não só ids).
 */
async function listRecentForDashboard(userId: string, limit: number): Promise<RecentTransactionRow[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, deletedAt: null },
    orderBy: { date: "desc" },
    take: limit,
    select: {
      id: true,
      description: true,
      type: true,
      amount: true,
      date: true,
      isPaid: true,
      transferId: true,
      installmentNumber: true,
      category: { select: { name: true, color: true } },
      account: { select: { name: true } },
      card: { select: { name: true } },
      installmentPurchase: { select: { installmentsCount: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    type: row.type,
    amount: row.amount,
    date: row.date,
    isPaid: row.isPaid,
    transferId: row.transferId,
    categoryName: row.category?.name ?? null,
    categoryColor: row.category?.color ?? null,
    accountName: row.account?.name ?? null,
    cardName: row.card?.name ?? null,
    installmentNumber: row.installmentNumber,
    installmentsCount: row.installmentPurchase?.installmentsCount ?? null,
  }));
}

/**
 * Compras parceladas do usuário (TODAS, ativas ou finalizadas) + parcelas
 * (`Transaction`) não deletadas + nome do cartão — insumo do progresso
 * derivado (ver service.ts `listInstallmentPurchasesWithProgress`,
 * docs/23-INSTALLMENTS.md "Valores Derivados"). Sem agregação aqui: a
 * derivação (paga/restante) depende de "hoje", que é regra do service, não
 * do acesso a dados. `cardId` opcional filtra pelo cartão (filtro da tela
 * `/installments`).
 */
async function listInstallmentPurchasesWithTransactions(
  userId: string,
  cardId?: string,
): Promise<InstallmentPurchaseRow[]> {
  const purchases = await prisma.installmentPurchase.findMany({
    where: { userId, ...(cardId ? { cardId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      description: true,
      totalAmount: true,
      installmentsCount: true,
      card: { select: { name: true } },
      transactions: {
        where: { deletedAt: null },
        select: { installmentNumber: true, amount: true, date: true },
        orderBy: { date: "asc" },
      },
    },
  });

  return purchases.map((purchase) => ({
    id: purchase.id,
    description: purchase.description,
    totalAmount: purchase.totalAmount,
    installmentsCount: purchase.installmentsCount,
    cardName: purchase.card.name,
    transactions: purchase.transactions,
  }));
}

export const transactionRepository = {
  findById,
  findDeletedById,
  create,
  update,
  softDelete,
  restore,
  list,
  findMostRecentByType,
  findDescriptionSuggestions,
  findMostRecentByDescription,
  sumAmountByTypeInRange,
  groupExpensesByCategoryInRange,
  findCategoryNamesByIds,
  findInstallmentTotalsByIds,
  listRecentForDashboard,
  listInstallmentPurchasesWithTransactions,
};
