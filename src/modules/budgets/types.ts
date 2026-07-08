import type { Budget, Prisma } from "@/generated/prisma/client";

export type { Budget };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/** Faixas de status do progresso — mesmos limites do card de budget (docs/26-BUDGETS.md, "Estados Visuais"). */
export type BudgetStatus = "NORMAL" | "ATTENTION" | "OVER";

/**
 * Budget + `spentAmount` DERIVADO (nunca persistido, ver docs/03-DATABASE.md)
 * + progresso calculado — retorno de `listWithProgress` (service.ts).
 */
export type BudgetWithProgress = Budget & {
  spentAmount: Money;
  /** Percentual gasto/planejado, 0-∞ (pode passar de 100 quando estourado). */
  progress: number;
  status: BudgetStatus;
};

/** Retorno de `cloneFromPreviousMonth` (service.ts) — resumo pro toast da UI. */
export type CloneBudgetsResult = {
  created: number;
  skipped: number;
  sourceMonth: number;
  sourceYear: number;
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
