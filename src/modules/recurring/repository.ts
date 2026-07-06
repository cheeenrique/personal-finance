import { prisma } from "@/lib/db/client";
import type { RecurringTransaction } from "@/generated/prisma/client";
import type { RecurringFrequency, TransactionType } from "@/generated/prisma/enums";

export type CreateRecurringTransactionData = {
  description: string;
  amount: string;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  active: boolean;
  nextRun: Date;
};

export type UpdateRecurringTransactionData = Partial<Omit<CreateRecurringTransactionData, "nextRun">> & {
  nextRun?: Date;
};

/**
 * Acesso a dados do módulo recurring. SEMPRE escopado por `userId` — sem
 * `deletedAt` porque `RecurringTransaction` não tem esse campo no schema
 * (docs/03-DATABASE.md): "excluir" um template é desativá-lo (`active =
 * false`, ver service.ts `deleteRecurringTransaction`), nunca some da
 * tabela.
 */

async function findById(userId: string, id: string): Promise<RecurringTransaction | null> {
  return prisma.recurringTransaction.findFirst({ where: { id, userId } });
}

async function list(userId: string): Promise<RecurringTransaction[]> {
  return prisma.recurringTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

async function create(userId: string, data: CreateRecurringTransactionData): Promise<RecurringTransaction> {
  return prisma.recurringTransaction.create({
    data: {
      userId,
      description: data.description,
      amount: data.amount,
      type: data.type,
      categoryId: data.categoryId,
      accountId: data.accountId,
      frequency: data.frequency,
      dayOfMonth: data.dayOfMonth,
      dayOfWeek: data.dayOfWeek,
      active: data.active,
      nextRun: data.nextRun,
    },
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * recorrência de outro usuário mesmo sabendo o `id` (docs/10-AUTH.md, "Regra
 * Principal de Segurança").
 */
async function update(
  userId: string,
  id: string,
  data: UpdateRecurringTransactionData,
): Promise<RecurringTransaction | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.recurringTransaction.update({
    where: { id },
    data: {
      ...(data.description !== undefined && { description: data.description }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.accountId !== undefined && { accountId: data.accountId }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.dayOfMonth !== undefined && { dayOfMonth: data.dayOfMonth }),
      ...(data.dayOfWeek !== undefined && { dayOfWeek: data.dayOfWeek }),
      ...(data.active !== undefined && { active: data.active }),
      ...(data.nextRun !== undefined && { nextRun: data.nextRun }),
    },
  });
}

/** Templates ativos vencidos (`nextRun <= now`) de UM usuário — usado pelo `runDue` "por sessão". */
async function findDueForUser(userId: string, now: Date): Promise<RecurringTransaction[]> {
  return prisma.recurringTransaction.findMany({
    where: { userId, active: true, nextRun: { lte: now } },
    orderBy: { nextRun: "asc" },
  });
}

/** Templates ativos vencidos de TODOS os usuários — usado pelo cron global (`/api/cron/recurring`). */
async function findAllDue(now: Date): Promise<RecurringTransaction[]> {
  return prisma.recurringTransaction.findMany({
    where: { active: true, nextRun: { lte: now } },
    orderBy: { nextRun: "asc" },
  });
}

/**
 * Avança `nextRun` e gera a Transaction correspondente, atomicamente.
 *
 * Idempotência: o `updateMany` só afeta a linha se `nextRun` ainda for
 * EXATAMENTE o valor lido (`expectedNextRun`) — um lock otimista. Se outra
 * execução já processou este template entre a leitura e esta chamada (ex.:
 * cron rodando 2x no mesmo instante), `count` vem 0 e nada é criado — sem
 * duplicar a Transaction. `nextRun` avança na MESMA transação em que a
 * Transaction nasce (docs/20-TRANSACTIONS.md: "Recorrência").
 */
async function advanceAndCreateTransaction(params: {
  templateId: string;
  expectedNextRun: Date;
  newNextRun: Date;
  transactionData: {
    userId: string;
    description: string;
    amount: string;
    type: TransactionType;
    categoryId: string;
    accountId: string;
    date: Date;
    isPaid: boolean;
  };
}): Promise<{ transactionId: string } | null> {
  return prisma.$transaction(async (tx) => {
    const advanced = await tx.recurringTransaction.updateMany({
      where: { id: params.templateId, nextRun: params.expectedNextRun },
      data: { nextRun: params.newNextRun },
    });

    if (advanced.count === 0) return null;

    const transaction = await tx.transaction.create({
      data: {
        userId: params.transactionData.userId,
        description: params.transactionData.description,
        amount: params.transactionData.amount,
        type: params.transactionData.type,
        categoryId: params.transactionData.categoryId,
        accountId: params.transactionData.accountId,
        date: params.transactionData.date,
        isPaid: params.transactionData.isPaid,
      },
    });

    return { transactionId: transaction.id };
  });
}

export const recurringRepository = {
  findById,
  list,
  create,
  update,
  findDueForUser,
  findAllDue,
  advanceAndCreateTransaction,
};
