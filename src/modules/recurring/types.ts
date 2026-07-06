import type { RecurringTransaction, Prisma } from "@/generated/prisma/client";
import type { RecurringFrequency, TransactionType } from "@/generated/prisma/enums";

export type { RecurringTransaction, RecurringFrequency, TransactionType };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/**
 * Campos de agendamento de um template — usados por `next-run.ts` pra
 * calcular o próximo disparo. Subconjunto de `RecurringTransaction`, isolado
 * pra `computeNextRun` não depender do tipo inteiro (nem de campos
 * irrelevantes ao cálculo).
 */
export type RecurringSchedule = {
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
};

/** Resultado de UMA execução de template disparado por `runDue` (ver run.ts). */
export type GeneratedRun = {
  recurringTransactionId: string;
  transactionId: string;
  userId: string;
  /** Data da Transaction gerada — é o `nextRun` que disparou (antes de avançar). */
  date: Date;
};
