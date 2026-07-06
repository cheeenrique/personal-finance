import type { Prisma } from "@/generated/prisma/client";
import type { CategoryExpenseTotal } from "@/modules/transactions/types";
import type { TotalEvolutionPoint } from "@/modules/assets/types";

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Ponto da série mensal receita x despesa — insumo do gráfico de linha/barra (docs/28-REPORTS.md, "Fluxo de Caixa"). */
export type IncomeExpenseMonthPoint = {
  year: number;
  month: number;
  income: Money;
  expense: Money;
};

/** Relatório por categoria — reaproveita o tipo já exposto por `modules/transactions` (mesma regra de exclusão). */
export type { CategoryExpenseTotal };

/** Entradas − saídas num período arbitrário (docs/28-REPORTS.md, "Relatório de Fluxo de Caixa"). */
export type CashflowReport = {
  dateFrom: Date;
  dateTo: Date;
  income: Money;
  expense: Money;
  net: Money;
};

/**
 * Movimentação por conta num período — CONTA Transfer e CARD_PAYMENT (regra
 * oposta à de receita/despesa, ver docs/28-REPORTS.md "Relatório por Conta").
 */
export type AccountMovementReport = {
  accountId: string;
  accountName: string;
  totalIn: Money;
  totalOut: Money;
  totalMovement: Money;
};

/** Evolução do patrimônio — reaproveita o tipo já exposto por `modules/assets`. */
export type { TotalEvolutionPoint };
