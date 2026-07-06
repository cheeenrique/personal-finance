import { prisma } from "@/lib/db/client";
import type { Category } from "@/generated/prisma/client";

/**
 * Checks de ownership cross-entidade — nunca criar/atualizar
 * RecurringTransaction referenciando Category/Account de outro usuário mesmo
 * sabendo o `id` (docs/10-AUTH.md, "Regra Principal de Segurança"). Separado
 * de `repository.ts` por responsabilidade — mesmo padrão de
 * `modules/transactions/ownership.ts`.
 */

async function findCategoryForUser(userId: string, categoryId: string): Promise<Category | null> {
  return prisma.category.findFirst({ where: { id: categoryId, userId, deletedAt: null } });
}

async function accountExists(userId: string, accountId: string): Promise<boolean> {
  const found = await prisma.account.findFirst({
    where: { id: accountId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

export const recurringOwnership = {
  findCategoryForUser,
  accountExists,
};
