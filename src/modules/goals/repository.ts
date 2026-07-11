import { prisma } from "@/lib/db/client";
import type { SavingsGoal } from "@/generated/prisma/client";
import type { GoalSourceType } from "@/generated/prisma/enums";

export type CreateGoalData = {
  name: string;
  targetAmount: string;
  targetDate?: Date | null;
  sourceType: GoalSourceType;
  sourceAccountId?: string | null;
  sourceAssetId?: string | null;
  currentAmount?: string;
  monthlyContribution?: string | null;
};

export type UpdateGoalData = Partial<CreateGoalData>;

/**
 * Acesso a dados do módulo goals. SEMPRE escopado por `userId` +
 * `deletedAt: null` (docs/03-DATABASE.md, "Princípio Principal").
 */

async function findById(userId: string, id: string): Promise<SavingsGoal | null> {
  return prisma.savingsGoal.findFirst({ where: { id, userId, deletedAt: null } });
}

async function list(userId: string): Promise<SavingsGoal[]> {
  return prisma.savingsGoal.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } });
}

async function create(userId: string, data: CreateGoalData): Promise<SavingsGoal> {
  return prisma.savingsGoal.create({
    data: {
      userId,
      name: data.name,
      targetAmount: data.targetAmount,
      targetDate: data.targetDate ?? null,
      sourceType: data.sourceType,
      sourceAccountId: data.sourceAccountId ?? null,
      sourceAssetId: data.sourceAssetId ?? null,
      currentAmount: data.currentAmount ?? "0",
      monthlyContribution: data.monthlyContribution ?? null,
    },
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * meta de outro usuário mesmo sabendo o `id` (docs/10-AUTH.md, "Regra
 * Principal de Segurança").
 */
async function update(userId: string, id: string, data: UpdateGoalData): Promise<SavingsGoal | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.savingsGoal.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
      ...(data.targetDate !== undefined && { targetDate: data.targetDate }),
      ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
      ...(data.sourceAccountId !== undefined && { sourceAccountId: data.sourceAccountId }),
      ...(data.sourceAssetId !== undefined && { sourceAssetId: data.sourceAssetId }),
      ...(data.currentAmount !== undefined && { currentAmount: data.currentAmount }),
      ...(data.monthlyContribution !== undefined && { monthlyContribution: data.monthlyContribution }),
    },
  });
}

/** Soft delete — nunca remove fisicamente (mesma convenção de accounts/budgets/tags). */
async function softDelete(userId: string, id: string): Promise<SavingsGoal | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.savingsGoal.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Ownership check do `Account` linkado (`sourceType=ACCOUNT`) — checagem
 * LOCAL (não cross-importa `accounts/repository.ts`), mesmo padrão de
 * `modules/loans/ownership.ts` (`loanOwnership.accountExists`) e
 * `modules/budgets/repository.ts` (`findCategoryForUser`): módulos não
 * cross-importam repository um do outro neste projeto.
 */
async function accountExists(userId: string, accountId: string): Promise<boolean> {
  const found = await prisma.account.findFirst({
    where: { id: accountId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

/** Ownership check do `Asset` linkado (`sourceType=ASSET`) — mesma regra de `accountExists` acima. */
async function assetExists(userId: string, assetId: string): Promise<boolean> {
  const found = await prisma.asset.findFirst({
    where: { id: assetId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

export const goalRepository = { findById, list, create, update, softDelete, accountExists, assetExists };
