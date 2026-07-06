import type { Card, Prisma } from "@/generated/prisma/client";

export type { Card };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/** Uma compra (EXPENSE, incluindo parcela) dentro do ciclo de uma fatura. */
export type InvoiceItem = {
  id: string;
  description: string;
  amount: Money;
  date: Date;
  installmentNumber: number | null;
  installmentPurchaseId: string | null;
};

/** Fatura calculada dinamicamente para um ciclo (docs/22-CREDIT_CARDS.md, "Lógica de Fatura"). */
export type Invoice = {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  total: Money;
  items: InvoiceItem[];
};

/** Card + resumo derivado (fatura atual, devedor, limite disponível) — ver service.ts `listWithSummary`. */
export type CardWithSummary = Card & {
  currentInvoiceTotal: Money;
  outstandingBalance: Money;
  availableLimit: Money;
  invoiceDueDate: Date;
};

export type PayInvoiceResult = {
  transactionId: string;
  cardId: string;
  accountId: string;
  amount: Money;
  date: Date;
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
