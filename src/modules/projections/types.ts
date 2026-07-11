import type { Prisma } from "@/generated/prisma/client";

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). Usado só internamente: o retorno público (`CashflowProjection`) já converte pra `number`. */
export type Money = Prisma.Decimal;

/** Um dia da projeção — `date` em `YYYY-MM-DD` (calendário America/Sao_Paulo, ver `toDateInputValueSaoPaulo`). */
export type ProjectionPoint = { date: string; balance: number };

/** Retorno de `projectionService.forecast` — serializável (sem `Prisma.Decimal`), pronto pra Server Component. */
export type CashflowProjection = {
  /** Um ponto por dia, do dia de `refDate` até `refDate + horizonDays - 1`, saldo acumulado. */
  points: ProjectionPoint[];
  /** Primeiro dia em que o saldo projetado fica negativo, ou `null` se nunca fica. */
  firstNegativeDate: string | null;
  lowestBalance: number;
  horizonDays: number;
};
