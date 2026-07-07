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
  KnownMerchant,
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

/**
 * `paidAt` é derivado da TRANSIÇÃO de `isPaid` num update — nunca aceito cru
 * do caller (docs/03-DATABASE.md, model Transaction). Centralizado aqui pra
 * TODOS os caminhos que tocam `isPaid` via `updateTransaction` pegarem a
 * MESMA regra: edição avulsa (`EditTransactionModal`), marcar paga por linha
 * ou em massa (`useTransactionMutations.markPaid`/`bulkMarkPaid`) e marcar
 * paga do empréstimo (`loan-detail-view.tsx`) — todos passam por
 * `updateTransactionAction` → aqui, nenhum tem lógica própria.
 *
 * Compara `newIsPaid` contra o `isPaid` ATUAL (não só "newIsPaid é true") —
 * `EditTransactionModal` sempre reenvia `isPaid` no payload (mesmo quando o
 * usuário não tocou no switch), então "true resubmetido sobre um `true` que
 * já existia" NÃO é uma transição e não pode setar `paidAt` de novo (senão
 * qualquer edição de descrição/valor numa transação já paga sem `paidAt`
 * — o caso comum de "compra normal" — geraria um `paidAt` falso na hora do
 * PRIMEIRO edit incidental).
 *
 * Transação que já NASCE paga (`isPaid=true` na criação) não ganha `paidAt`
 * na criação — sem uma transição pendente→paga pra capturar, não existe
 * "quando foi paga" pra registrar. `paidAt` marca especificamente o momento
 * em que uma PENDÊNCIA virou paga.
 *
 * - `isPaid` não veio no payload OU veio igual ao valor atual: não mexe em
 *   `paidAt` (sem transição real).
 * - `false → true`: `paidAt = now()`, só se ainda não tiver um valor
 *   (idempotente — chamar de novo com o mesmo resultado não reseta a data).
 * - `true → false`: limpa `paidAt` (volta a pendente, sem "pago em").
 */
function resolvePaidAtOnUpdate(
  existing: { isPaid: boolean; paidAt: Date | null },
  newIsPaid: boolean | undefined,
): Date | null | undefined {
  if (newIsPaid === undefined || newIsPaid === existing.isPaid) return undefined;
  if (!newIsPaid) return null;
  return existing.paidAt ?? new Date();
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

  const paidAt = resolvePaidAtOnUpdate(existing, input.isPaid);

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
    ...(paidAt !== undefined && { paidAt }),
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

/**
 * Busca UMA transação completa por id (escopada a `userId`). Insumo do fluxo
 * de edição a partir de listas que só carregam um subconjunto de campos —
 * ex.: `InvoiceItem` (docs/22-CREDIT_CARDS.md, "Detalhe do Cartão") não traz
 * categoria/notas/tags porque a fatura é só leitura derivada; o form de
 * edição (`EditTransactionModal`) busca a `Transaction` real sob demanda em
 * vez de inflar o shape da fatura com campos que ela não usa.
 */
async function getTransaction(userId: string, id: string): Promise<TransactionWithTags> {
  const transaction = await transactionRepository.findById(userId, id);
  if (!transaction) throw new TransactionNotFoundError(id);
  return transaction;
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

const SUGGESTION_MIN_QUERY_LENGTH = 2;
const SUGGESTION_LIMIT = 8;
const SUGGESTION_MAX_QUERY_LENGTH = 255;

/**
 * Autocomplete do campo Descrição — descrições anteriores do próprio usuário
 * que combinam com `query` (docs/20-TRANSACTIONS.md). Ignora buscas curtas
 * demais (ruído, sem poder discriminatório).
 */
async function suggestDescriptions(userId: string, query: string): Promise<string[]> {
  const trimmed = query.trim().slice(0, SUGGESTION_MAX_QUERY_LENGTH);
  if (trimmed.length < SUGGESTION_MIN_QUERY_LENGTH) return [];
  return transactionRepository.findDescriptionSuggestions(userId, trimmed, SUGGESTION_LIMIT);
}

/**
 * Categoria da transação mais recente com essa descrição EXATA — bônus do
 * autocomplete de Descrição: ao escolher uma sugestão, pré-preenche a
 * categoria em vez de deixar o campo vazio de novo.
 */
async function lastCategoryForDescription(userId: string, description: string): Promise<Category | null> {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const lastTransaction = await transactionRepository.findMostRecentByDescription(userId, trimmed);
  return lastTransaction?.category ?? null;
}

/**
 * Pagadores/merchants conhecidos do usuário — as `limit` descrições mais
 * frequentes + a categoria DOMINANTE (mais usada) de cada, ordenadas por
 * frequência desc (docs/30-TELEGRAM.md, "Parsing por IA"). Insumo do prompt
 * do Gemini no Telegram: casa semanticamente a descrição de uma transação
 * nova contra um merchant já conhecido, mesmo quando o texto vem diferente.
 * Sem N+1: 2 `groupBy` + 1 lookup de nomes (`findCategoryNamesByIds`, já
 * reusado por `expensesByCategory`), tudo agregado no banco. Descrições sem
 * NENHUM histórico categorizado (ex.: só `CARD_PAYMENT`) ficam de fora — não
 * há categoria pra ensinar a IA.
 */
async function listKnownMerchants(userId: string, limit: number): Promise<KnownMerchant[]> {
  const frequencies = await transactionRepository.findDescriptionFrequencies(userId, limit);
  if (frequencies.length === 0) return [];

  const descriptions = frequencies.map((row) => row.description);
  const categoryCounts = await transactionRepository.findCategoryCountsByDescriptions(userId, descriptions);

  // 1ª ocorrência de cada descrição já é a categoria dominante — ver o
  // comentário de `findCategoryCountsByDescriptions` (ordenado por contagem
  // desc globalmente).
  const dominantCategoryId = new Map<string, string>();
  for (const row of categoryCounts) {
    if (!dominantCategoryId.has(row.description)) dominantCategoryId.set(row.description, row.categoryId);
  }

  const namesById = await transactionRepository.findCategoryNamesByIds([...new Set(dominantCategoryId.values())]);

  return frequencies
    .map((row) => {
      const categoryId = dominantCategoryId.get(row.description);
      const categoryName = categoryId ? namesById.get(categoryId) : undefined;
      return categoryName ? { description: row.description, categoryName } : null;
    })
    .filter((merchant): merchant is KnownMerchant => merchant !== null);
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Previsto / A pagar" num período ARBITRÁRIO — generalização de
 * `monthlyUnpaidExpenseTotal` pro filtro de período do Dashboard (docs/11-DASHBOARD.md,
 * ver `components/reports/report-filters.ts` `resolveDateRange`). `dateFrom`/`dateTo`
 * chegam como meia-noite SP do dia (`parseFlexibleDate`) — soma 24h em `dateTo` pra
 * virar o limite EXCLUSIVO do dia seguinte (sem risco de DST, Brasil não observa
 * desde 2019), igual `monthWindowUtc` acima. `date` NÃO é garantidamente meia-noite
 * (`dateInputSchema.default(() => new Date())` grava a hora real quando o caller não
 * informa uma data explícita, ex.: lançamento rápido/Telegram) — mas um limite
 * EXCLUSIVO (`lt`, não `lte`) cobre o dia inteiro de qualquer forma, sem precisar do
 * ajuste "-1ms" que `modules/reports/service.ts` `endOfDayInclusive` faz pra `lte`.
 */
async function unpaidExpenseTotalInRange(userId: string, dateFrom: Date, dateTo: Date): Promise<Money> {
  const range = { gte: dateFrom, lt: new Date(dateTo.getTime() + ONE_DAY_MS) };
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
 *
 * `remainingAmount` soma as parcelas futuras AINDA VIVAS (`upcoming`), não
 * `totalAmount - paidAmount` — as duas contas batem no caso comum (nenhuma
 * parcela futura foi tocada, a soma de todas bate com `totalAmount` por
 * construção do rateio), mas SÓ a soma de `upcoming` continua correta depois
 * de `installments.ts` `cancelInstallmentPurchase` soft-deletar parcelas
 * futuras (elas já saem de `purchase.transactions`, filtrado por
 * `deletedAt: null` no repository) — sem isso, uma compra cancelada
 * continuaria mostrando "restante" como se a dívida futura ainda existisse.
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
    const remainingAmount = upcoming.reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0));

    return {
      id: purchase.id,
      description: purchase.description,
      cardName: purchase.cardName,
      totalAmount: purchase.totalAmount,
      installmentsCount: purchase.installmentsCount,
      paidCount: paid.length,
      paidAmount,
      remainingAmount,
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
 *
 * Filtra por `nextDueDate !== null` (existe parcela futura AINDA VIVA), não
 * por `paidCount < installmentsCount` — depois de
 * `cancelInstallmentPurchase`, `installmentsCount` continua sendo o contrato
 * ORIGINAL (Regra 1, docs/23-INSTALLMENTS.md: nunca muda), então comparar
 * contra ele classificaria uma compra cancelada como "ativa" mesmo sem
 * nenhuma parcela futura de fato pendente.
 */
async function listActiveInstallmentPurchases(
  userId: string,
  refDate: Date = new Date(),
): Promise<ActiveInstallmentPurchase[]> {
  const purchases = await listInstallmentPurchasesWithProgress(userId, refDate);

  return purchases
    .filter((purchase) => purchase.nextDueDate !== null)
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
  getTransaction,
  list,
  lastUsedCategory,
  suggestDescriptions,
  lastCategoryForDescription,
  listKnownMerchants,
  monthlyExpenseTotal,
  monthlyIncomeTotal,
  monthlyUnpaidExpenseTotal,
  unpaidExpenseTotalInRange,
  expensesByCategory,
  listRecentForDashboard,
  listActiveInstallmentPurchases,
  listInstallmentPurchasesWithProgress,
  installmentTotals,
};
