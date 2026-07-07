import type { Transaction, Category, Prisma } from "@/generated/prisma/client";
import type { TransactionType } from "@/generated/prisma/enums";

export type { Transaction, Category, TransactionType };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/** Transação + tags associadas via junction (ver docs/03-DATABASE.md, TransactionTag). */
export type TransactionWithTags = Transaction & {
  transactionTags: { tagId: string }[];
};

export type TransactionSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

/** Paginação server-side — reaproveitado por Transações, histórico da conta (`/accounts/[id]`) e compras da fatura atual (`/cards/[id]`), ver docs/04-DESIGN_SYSTEM.md "Tabelas". */
export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Insumo do gráfico "gastos por categoria" do dashboard (ver docs/24-CATEGORIES.md). */
export type CategoryExpenseTotal = {
  categoryId: string;
  categoryName: string;
  total: Money;
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Resultado da criação de uma compra parcelada — o guarda-chuva + as N parcelas (ver docs/23-INSTALLMENTS.md). */
export type InstallmentPurchaseResult = {
  installmentPurchaseId: string;
  transactions: TransactionWithTags[];
};

/**
 * `TransactionWithTags` com `amount` já convertido pra string — forma que
 * cruza a fronteira Server Action → Client Component (docs/03-DATABASE.md,
 * "Parse/format só na borda (UI)"). `Prisma.Decimal` é uma instância de
 * classe (decimal.js) e não sobrevive à serialização de Server Actions do
 * Next.js sem essa conversão explícita.
 */
export type ClientTransaction = Omit<TransactionWithTags, "amount"> & { amount: string };

/** Linha do preview "Últimas Transações" do Dashboard — nomes já resolvidos (docs/11-DASHBOARD.md). */
export type RecentTransactionRow = {
  id: string;
  description: string;
  type: TransactionType;
  amount: Money;
  date: Date;
  isPaid: boolean;
  /** Não-nulo ⇒ é uma perna de transferência — exibida como badge "Transferência", nunca como INCOME/EXPENSE cru (docs/06-SCREENS.md). */
  transferId: string | null;
  categoryName: string | null;
  /** Hex opcional (`Category.color`) — bolinha colorida ao lado do nome (docs/04-DESIGN_SYSTEM.md, "Categoria"). */
  categoryColor: string | null;
  accountName: string | null;
  cardName: string | null;
  installmentNumber: number | null;
  installmentsCount: number | null;
};

/**
 * `RecentTransactionRow` com `amount` já convertido pra string — forma que
 * cruza a fronteira Server Component → Client Component (mesma regra de
 * `ClientTransaction` acima: `Prisma.Decimal` não sobrevive à serialização
 * de Server Components sem essa conversão explícita).
 */
export type RecentTransactionRowClient = Omit<RecentTransactionRow, "amount"> & { amount: string };

/** Compra parcelada + parcelas cruas (pré-derivação) — insumo de `listInstallmentPurchasesWithProgress`. */
export type InstallmentPurchaseRow = {
  id: string;
  description: string;
  totalAmount: Money;
  installmentsCount: number;
  cardName: string;
  transactions: Array<{ installmentNumber: number | null; amount: Money; date: Date }>;
};

/** Compra parcelada ATIVA (parcelas restantes > 0) + progresso derivado (docs/23-INSTALLMENTS.md, "Visual no Dashboard"). */
export type ActiveInstallmentPurchase = {
  id: string;
  description: string;
  cardName: string;
  totalAmount: Money;
  installmentsCount: number;
  paidCount: number;
  paidAmount: Money;
  remainingAmount: Money;
  nextDueDate: Date | null;
};

/** Uma parcela dentro da lista de "Detalhes" de uma compra parcelada (docs/23-INSTALLMENTS.md, "Parcelas Futuras"). */
export type InstallmentLineItem = {
  installmentNumber: number;
  amount: Money;
  date: Date;
  /** `date <= refDate` — mesma regra de "paga" usada no progresso derivado (docs/23-INSTALLMENTS.md, "Valores Derivados"). */
  isPaid: boolean;
};

/**
 * Compra parcelada (TODAS, ativas ou finalizadas) + progresso derivado + as N
 * parcelas em detalhe — insumo da tela `/installments` (docs/23-INSTALLMENTS.md,
 * "Listagem de Parcelamentos"). Superset de `ActiveInstallmentPurchase`
 * (mesmos campos derivados) + `installments` para o drill-down "Detalhes".
 */
export type InstallmentPurchaseWithProgress = ActiveInstallmentPurchase & {
  installments: InstallmentLineItem[];
};
