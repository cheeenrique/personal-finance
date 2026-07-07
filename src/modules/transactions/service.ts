import { Prisma } from "@/generated/prisma/client";
import { TransactionType, CategoryType } from "@/generated/prisma/enums";
import { parseInSaoPaulo } from "@/lib/date/timezone";
import { transactionRepository } from "./repository";
import { transactionOwnership } from "./ownership";
import {
  TransactionNotFoundError,
  InvalidSourceError,
  CategoryNotFoundError,
  CategoryRequiredError,
  CategoryNotAllowedError,
  CategoryTypeMismatchError,
  TagNotFoundError,
} from "./errors";
import type { CreateTransactionInput, UpdateTransactionInput, ListFilterInput } from "./schemas";
import type {
  ActiveInstallmentPurchase,
  Category,
  CategoryExpenseTotal,
  InstallmentPurchaseWithProgress,
  Money,
  PaginatedResult,
  RecentTransactionRow,
  TransactionWithTags,
} from "./types";

/**
 * Invariante central da transação (docs/03-DATABASE.md, docs/24-CATEGORIES.md):
 * exatamente uma origem (conta OU cartão) e categoria obrigatória, exceto
 * CARD_PAYMENT (categoria sempre null — pagamento de fatura não é gasto novo
 * por categoria). Reavaliada contra o estado MESCLADO em updates parciais.
 */
function assertSourceAndCategoryInvariant(
  type: TransactionType,
  categoryId: string | null,
  accountId: string | null,
  cardId: string | null,
): void {
  if (Boolean(accountId) === Boolean(cardId)) {
    throw new InvalidSourceError("Informe exatamente uma origem: conta ou cartão", {
      accountId,
      cardId,
    });
  }

  if (type === TransactionType.CARD_PAYMENT) {
    if (categoryId) throw new CategoryNotAllowedError();
    return;
  }

  if (!categoryId) throw new CategoryRequiredError();
}

/** Exportado para reuso por `installments.ts` (mesma regra de ownership, sem duplicar query). */
export async function assertCategoryOwnership(
  userId: string,
  categoryId: string,
  type: TransactionType,
): Promise<void> {
  const category = await transactionOwnership.findCategoryForUser(userId, categoryId);
  if (!category) throw new CategoryNotFoundError(categoryId);

  const expectedCategoryType = type === TransactionType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE;
  if (category.type !== expectedCategoryType) throw new CategoryTypeMismatchError(categoryId);
}

export async function assertAccountOwnership(userId: string, accountId: string): Promise<void> {
  const exists = await transactionOwnership.accountExists(userId, accountId);
  if (!exists) throw new InvalidSourceError("Conta não encontrada", { accountId });
}

export async function assertCardOwnership(userId: string, cardId: string): Promise<void> {
  const exists = await transactionOwnership.cardExists(userId, cardId);
  if (!exists) throw new InvalidSourceError("Cartão não encontrado", { cardId });
}

export async function assertTagsOwnership(userId: string, tagIds: string[]): Promise<void> {
  const count = await transactionOwnership.countExistingTags(userId, tagIds);
  if (count !== tagIds.length) throw new TagNotFoundError(tagIds);
}

async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<TransactionWithTags> {
  const categoryId = input.categoryId ?? null;
  const accountId = input.accountId ?? null;
  const cardId = input.cardId ?? null;

  assertSourceAndCategoryInvariant(input.type, categoryId, accountId, cardId);

  if (categoryId) await assertCategoryOwnership(userId, categoryId, input.type);
  if (accountId) await assertAccountOwnership(userId, accountId);
  if (cardId) await assertCardOwnership(userId, cardId);
  if (input.tagIds.length > 0) await assertTagsOwnership(userId, input.tagIds);

  return transactionRepository.create(userId, {
    description: input.description,
    type: input.type,
    amount: input.amount,
    categoryId,
    accountId,
    cardId,
    date: input.date,
    notes: input.notes ?? null,
    isPaid: input.isPaid,
    tagIds: input.tagIds,
  });
}

async function updateTransaction(
  userId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionWithTags> {
  const existing = await transactionRepository.findById(userId, id);
  if (!existing) throw new TransactionNotFoundError(id);

  const resultType = (input.type ?? existing.type) as TransactionType;
  const resultCategoryId = input.categoryId !== undefined ? input.categoryId : existing.categoryId;
  const resultAccountId = input.accountId !== undefined ? input.accountId : existing.accountId;
  const resultCardId = input.cardId !== undefined ? input.cardId : existing.cardId;

  assertSourceAndCategoryInvariant(resultType, resultCategoryId, resultAccountId, resultCardId);

  if (input.categoryId) await assertCategoryOwnership(userId, input.categoryId, resultType);
  if (input.accountId) await assertAccountOwnership(userId, input.accountId);
  if (input.cardId) await assertCardOwnership(userId, input.cardId);
  if (input.tagIds && input.tagIds.length > 0) await assertTagsOwnership(userId, input.tagIds);

  const updated = await transactionRepository.update(userId, id, {
    ...(input.description !== undefined && { description: input.description }),
    ...(input.amount !== undefined && { amount: input.amount }),
    ...(input.type !== undefined && { type: input.type }),
    ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
    ...(input.accountId !== undefined && { accountId: input.accountId }),
    ...(input.cardId !== undefined && { cardId: input.cardId }),
    ...(input.date !== undefined && { date: input.date }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.isPaid !== undefined && { isPaid: input.isPaid }),
    ...(input.tagIds !== undefined && { tagIds: input.tagIds }),
  });

  if (!updated) throw new TransactionNotFoundError(id);
  return updated;
}

async function deleteTransaction(userId: string, id: string): Promise<void> {
  const deleted = await transactionRepository.softDelete(userId, id);
  if (!deleted) throw new TransactionNotFoundError(id);
}

async function undoDeleteTransaction(userId: string, id: string): Promise<TransactionWithTags> {
  const restored = await transactionRepository.restore(userId, id);
  if (!restored) throw new TransactionNotFoundError(id);
  return restored;
}

async function list(
  userId: string,
  filters: ListFilterInput,
): Promise<PaginatedResult<TransactionWithTags>> {
  const { page, pageSize, sort, ...where } = filters;
  const { items, total } = await transactionRepository.list(userId, where, { page, pageSize, sort });
  return { items, total, page, pageSize };
}

/** Default do cadastro rápido (docs/05-UX_RULES.md): categoria mais RECENTEMENTE usada para o tipo, não a mais frequente. */
async function lastUsedCategory(
  userId: string,
  type: Extract<TransactionType, "INCOME" | "EXPENSE">,
): Promise<Category | null> {
  const lastTransaction = await transactionRepository.findMostRecentByType(userId, type);
  return lastTransaction?.category ?? null;
}

/**
 * Janela do mês em America/Sao_Paulo, convertida para o instante UTC correto
 * — construção via `new Date(y, m, d, ...)` (getters locais) é o formato que
 * `parseInSaoPaulo`/`fromZonedTime` espera, independente do timezone do host
 * (ver node_modules/date-fns-tz `fromZonedTime`: lê os getters locais do Date
 * recebido, não os UTC).
 */
function monthWindowUtc(year: number, month: number): { gte: Date; lt: Date } {
  const startOfMonthLocal = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const startOfNextMonthLocal =
    month === 12 ? new Date(year + 1, 0, 1, 0, 0, 0, 0) : new Date(year, month, 1, 0, 0, 0, 0);

  return {
    gte: parseInSaoPaulo(startOfMonthLocal),
    lt: parseInSaoPaulo(startOfNextMonthLocal),
  };
}

/**
 * REGRA CRÍTICA (ver docs/03-DATABASE.md, docs/11-DASHBOARD.md, docs/28-REPORTS.md):
 * KPIs de despesa/receita excluem transferências filtrando `transferId IS NOT
 * NULL` (as pernas de transfer são EXPENSE/INCOME com `transferId`
 * preenchido — nunca existe `type=TRANSFER` persistido) e excluem
 * `type=CARD_PAYMENT`. Considera só `isPaid=true`, `deletedAt=null`.
 */
async function monthlyExpenseTotal(userId: string, year: number, month: number): Promise<Money> {
  const range = monthWindowUtc(year, month);
  return transactionRepository.sumAmountByTypeInRange(userId, TransactionType.EXPENSE, range);
}

async function monthlyIncomeTotal(userId: string, year: number, month: number): Promise<Money> {
  const range = monthWindowUtc(year, month);
  return transactionRepository.sumAmountByTypeInRange(userId, TransactionType.INCOME, range);
}

/**
 * "Previsto / A Pagar" (docs/11-DASHBOARD.md): despesas do mês ainda não
 * pagas (`isPaid=false`). Bloco separado de `monthlyExpenseTotal` — não soma
 * com ele, nunca impacta saldo/despesa até a despesa ser marcada como paga.
 */
async function monthlyUnpaidExpenseTotal(userId: string, year: number, month: number): Promise<Money> {
  const range = monthWindowUtc(year, month);
  return transactionRepository.sumAmountByTypeInRange(userId, TransactionType.EXPENSE, range, false);
}

async function expensesByCategory(
  userId: string,
  year: number,
  month: number,
): Promise<CategoryExpenseTotal[]> {
  const range = monthWindowUtc(year, month);
  const grouped = await transactionRepository.groupExpensesByCategoryInRange(userId, range);

  const categoryIds = grouped
    .filter((row): row is typeof row & { categoryId: string } => row.categoryId !== null)
    .map((row) => row.categoryId);
  const namesById = await transactionRepository.findCategoryNamesByIds(categoryIds);

  return grouped
    .filter((row): row is typeof row & { categoryId: string } => row.categoryId !== null)
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: namesById.get(row.categoryId) ?? "—",
      total: row.sum,
    }))
    .sort((a, b) => b.total.comparedTo(a.total));
}

/** N transações mais recentes (nomes já resolvidos) — preview do Dashboard (docs/11-DASHBOARD.md, "Últimas Transações"). */
async function listRecentForDashboard(userId: string, limit: number): Promise<RecentTransactionRow[]> {
  return transactionRepository.listRecentForDashboard(userId, limit);
}

/**
 * Compras parceladas do usuário — TODAS (ativas ou finalizadas) — com
 * progresso derivado + as N parcelas em detalhe (insumo de `/installments`,
 * docs/23-INSTALLMENTS.md, "Listagem de Parcelamentos"). Nada persistido além
 * de `InstallmentPurchase`/`Transaction` (docs/23-INSTALLMENTS.md, "Valores
 * Derivados"). Uma parcela é "paga" quando sua data de vencimento já passou
 * (`date <= agora`) — mesma regra de compra confirmada no cartão, não existe
 * pagamento manual de parcela individual. `cardId` opcional filtra pelo
 * cartão (filtro `?cardId=` da tela `/installments`).
 */
async function listInstallmentPurchasesWithProgress(
  userId: string,
  refDate: Date = new Date(),
  cardId?: string,
): Promise<InstallmentPurchaseWithProgress[]> {
  const purchases = await transactionRepository.listInstallmentPurchasesWithTransactions(userId, cardId);

  return purchases.map((purchase) => {
    const paid = purchase.transactions.filter((transaction) => transaction.date.getTime() <= refDate.getTime());
    const upcoming = purchase.transactions.filter((transaction) => transaction.date.getTime() > refDate.getTime());
    const paidAmount = paid.reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0));

    return {
      id: purchase.id,
      description: purchase.description,
      cardName: purchase.cardName,
      totalAmount: purchase.totalAmount,
      installmentsCount: purchase.installmentsCount,
      paidCount: paid.length,
      paidAmount,
      remainingAmount: purchase.totalAmount.minus(paidAmount),
      nextDueDate: upcoming[0]?.date ?? null,
      installments: purchase.transactions.map((transaction) => ({
        // `installmentNumber` é sempre preenchido nas Transactions de uma InstallmentPurchase
        // (ver installments.ts `createInstallmentPurchase`) — null só existe no tipo por ele
        // ser compartilhado com Transaction "solta" (docs/03-DATABASE.md).
        installmentNumber: transaction.installmentNumber ?? 0,
        amount: transaction.amount,
        date: transaction.date,
        isPaid: transaction.date.getTime() <= refDate.getTime(),
      })),
    };
  });
}

/**
 * Compras parceladas ATIVAS (parcelas restantes > 0) — subconjunto de
 * `listInstallmentPurchasesWithProgress` sem o detalhe das parcelas (insumo
 * do Dashboard, docs/11-DASHBOARD.md, "Parcelamentos Ativos").
 */
async function listActiveInstallmentPurchases(
  userId: string,
  refDate: Date = new Date(),
): Promise<ActiveInstallmentPurchase[]> {
  const purchases = await listInstallmentPurchasesWithProgress(userId, refDate);

  return purchases
    .filter((purchase) => purchase.paidCount < purchase.installmentsCount)
    .map((purchase) => ({
      id: purchase.id,
      description: purchase.description,
      cardName: purchase.cardName,
      totalAmount: purchase.totalAmount,
      installmentsCount: purchase.installmentsCount,
      paidCount: purchase.paidCount,
      paidAmount: purchase.paidAmount,
      remainingAmount: purchase.remainingAmount,
      nextDueDate: purchase.nextDueDate,
    }));
}

/** `installmentsCount` por `installmentPurchaseId` — insumo do badge "N/total" na listagem (ver actions.ts `getInstallmentTotalsAction`). */
async function installmentTotals(userId: string, installmentPurchaseIds: string[]): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(installmentPurchaseIds)];
  return transactionRepository.findInstallmentTotalsByIds(userId, uniqueIds);
}

export const transactionService = {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  undoDeleteTransaction,
  list,
  lastUsedCategory,
  monthlyExpenseTotal,
  monthlyIncomeTotal,
  monthlyUnpaidExpenseTotal,
  expensesByCategory,
  listRecentForDashboard,
  listActiveInstallmentPurchases,
  listInstallmentPurchasesWithProgress,
  installmentTotals,
};
