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

/** Transactions é a única lista paginada do app (ver docs/01-STACK.md, "Performance"). */
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
