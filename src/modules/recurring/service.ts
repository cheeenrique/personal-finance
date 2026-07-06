import { CategoryType, RecurringFrequency } from "@/generated/prisma/enums";
import { recurringRepository } from "./repository";
import { recurringOwnership } from "./ownership";
import { computeNextRun } from "./next-run";
import { runDue as runDueTemplates } from "./run";
import {
  RecurringTransactionNotFoundError,
  CategoryNotFoundError,
  CategoryTypeMismatchError,
  AccountNotFoundError,
  InvalidScheduleError,
} from "./errors";
import type { CreateRecurringTransactionInput, UpdateRecurringTransactionInput } from "./schemas";
import type { GeneratedRun, RecurringTransaction, TransactionType } from "./types";

/**
 * Invariante de agendamento (docs/20-TRANSACTIONS.md, "Recorrência"): MONTHLY
 * exige `dayOfMonth`, WEEKLY exige `dayOfWeek`. Já barrado no schema pra
 * `create` (payload isolado) — reavaliado aqui contra o estado MESCLADO em
 * updates parciais, mesmo padrão de
 * `modules/transactions/service.ts` `assertSourceAndCategoryInvariant`.
 */
function assertScheduleInvariant(
  frequency: RecurringFrequency,
  dayOfMonth: number | null,
  dayOfWeek: number | null,
): void {
  if (frequency === RecurringFrequency.MONTHLY && dayOfMonth === null) {
    throw new InvalidScheduleError("dayOfMonth é obrigatório para frequência MONTHLY", { frequency });
  }

  if (frequency === RecurringFrequency.WEEKLY && dayOfWeek === null) {
    throw new InvalidScheduleError("dayOfWeek é obrigatório para frequência WEEKLY", { frequency });
  }
}

async function assertCategoryOwnership(
  userId: string,
  categoryId: string,
  type: TransactionType,
): Promise<void> {
  const category = await recurringOwnership.findCategoryForUser(userId, categoryId);
  if (!category) throw new CategoryNotFoundError(categoryId);

  const expectedCategoryType = type === "INCOME" ? CategoryType.INCOME : CategoryType.EXPENSE;
  if (category.type !== expectedCategoryType) throw new CategoryTypeMismatchError(categoryId);
}

async function assertAccountOwnership(userId: string, accountId: string): Promise<void> {
  const exists = await recurringOwnership.accountExists(userId, accountId);
  if (!exists) throw new AccountNotFoundError(accountId);
}

async function createRecurringTransaction(
  userId: string,
  input: CreateRecurringTransactionInput,
): Promise<RecurringTransaction> {
  await assertCategoryOwnership(userId, input.categoryId, input.type);
  await assertAccountOwnership(userId, input.accountId);

  const dayOfMonth = input.frequency === RecurringFrequency.MONTHLY ? (input.dayOfMonth ?? null) : null;
  const dayOfWeek = input.frequency === RecurringFrequency.WEEKLY ? (input.dayOfWeek ?? null) : null;
  assertScheduleInvariant(input.frequency, dayOfMonth, dayOfWeek);

  const nextRun = computeNextRun({ frequency: input.frequency, dayOfMonth, dayOfWeek }, new Date());

  return recurringRepository.create(userId, {
    description: input.description,
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    accountId: input.accountId,
    frequency: input.frequency,
    dayOfMonth,
    dayOfWeek,
    active: input.active,
    nextRun,
  });
}

async function updateRecurringTransaction(
  userId: string,
  id: string,
  input: UpdateRecurringTransactionInput,
): Promise<RecurringTransaction> {
  const existing = await recurringRepository.findById(userId, id);
  if (!existing) throw new RecurringTransactionNotFoundError(id);

  const resultType = input.type ?? existing.type;
  const resultFrequency = input.frequency ?? existing.frequency;
  const resultDayOfMonth = input.dayOfMonth !== undefined ? input.dayOfMonth : existing.dayOfMonth;
  const resultDayOfWeek = input.dayOfWeek !== undefined ? input.dayOfWeek : existing.dayOfWeek;

  if (input.categoryId) await assertCategoryOwnership(userId, input.categoryId, resultType);
  if (input.accountId) await assertAccountOwnership(userId, input.accountId);

  const normalizedDayOfMonth = resultFrequency === RecurringFrequency.MONTHLY ? resultDayOfMonth : null;
  const normalizedDayOfWeek = resultFrequency === RecurringFrequency.WEEKLY ? resultDayOfWeek : null;
  assertScheduleInvariant(resultFrequency, normalizedDayOfMonth, normalizedDayOfWeek);

  const scheduleChanged =
    input.frequency !== undefined || input.dayOfMonth !== undefined || input.dayOfWeek !== undefined;
  const nextRun = scheduleChanged
    ? computeNextRun(
        { frequency: resultFrequency, dayOfMonth: normalizedDayOfMonth, dayOfWeek: normalizedDayOfWeek },
        new Date(),
      )
    : undefined;

  const updated = await recurringRepository.update(userId, id, {
    ...(input.description !== undefined && { description: input.description }),
    ...(input.amount !== undefined && { amount: input.amount }),
    ...(input.type !== undefined && { type: input.type }),
    ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
    ...(input.accountId !== undefined && { accountId: input.accountId }),
    ...(input.active !== undefined && { active: input.active }),
    frequency: resultFrequency,
    dayOfMonth: normalizedDayOfMonth,
    dayOfWeek: normalizedDayOfWeek,
    ...(nextRun !== undefined && { nextRun }),
  });

  if (!updated) throw new RecurringTransactionNotFoundError(id);
  return updated;
}

/**
 * `RecurringTransaction` não tem `deletedAt` no schema (docs/03-DATABASE.md)
 * — "excluir" um template é desativá-lo, preservando o histórico de
 * Transactions já geradas (docs/20-TRANSACTIONS.md: "Usuário pode desativar
 * (active=false) sem apagar o histórico já gerado").
 */
async function deleteRecurringTransaction(userId: string, id: string): Promise<void> {
  const updated = await recurringRepository.update(userId, id, { active: false });
  if (!updated) throw new RecurringTransactionNotFoundError(id);
}

/** Alterna `active` — usado pelo toggle de ligar/desligar na UI (diferente de "excluir", que só desliga). */
async function toggleActive(userId: string, id: string): Promise<RecurringTransaction> {
  const existing = await recurringRepository.findById(userId, id);
  if (!existing) throw new RecurringTransactionNotFoundError(id);

  const updated = await recurringRepository.update(userId, id, { active: !existing.active });
  if (!updated) throw new RecurringTransactionNotFoundError(id);
  return updated;
}

async function list(userId: string): Promise<RecurringTransaction[]> {
  return recurringRepository.list(userId);
}

/**
 * Gera as Transactions vencidas — de UM usuário (`userId`) ou de TODOS
 * (cron global, `userId` omitido). Ver `run.ts` pro detalhe de
 * atomicidade/idempotência por template.
 */
async function runDue(userId?: string, now: Date = new Date()): Promise<GeneratedRun[]> {
  return runDueTemplates(userId, now);
}

export const recurringService = {
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  toggleActive,
  list,
  runDue,
};
