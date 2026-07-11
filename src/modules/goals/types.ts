import type { SavingsGoal, Prisma } from "@/generated/prisma/client";

export type { SavingsGoal };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/**
 * `SavingsGoal` + progresso DERIVADO (nunca persistido, docs/03-DATABASE.md)
 * — retorno de `listWithProgress` (service.ts). `current`/`target` já em
 * `number` pra consumo direto da UI (view type, sem outro consumidor além de
 * `/goals`).
 */
export type GoalProgress = {
  goal: SavingsGoal;
  /** Valor atual da meta — `currentAmount` (MANUAL), saldo da conta (ACCOUNT) ou `currentValue` do ativo (ASSET). */
  current: number;
  target: number;
  /** Percentual atingido, 0-100 (nunca passa de 100 — meta completa satura em 100). */
  pct: number;
  /** Meses estimados até bater a meta no ritmo de aporte atual — `null` quando o ritmo é zero/negativo (sem ETA calculável). `0` = meta já completa. */
  etaMonths: number | null;
  /** Aporte mensal necessário pra bater `targetDate` — `null` quando a meta não tem `targetDate`. */
  requiredMonthly: number | null;
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
