import { prisma } from "@/lib/db/client";
import type { Category } from "@/generated/prisma/client";

/**
 * Checks de ownership cross-entidade — nunca criar/atualizar Transaction
 * referenciando Category/Account/Card/Tag de outro usuário mesmo sabendo o
 * `id` (docs/10-AUTH.md, "Regra Principal de Segurança"). Separado de
 * `repository.ts` (CRUD/agregação de Transaction) por responsabilidade —
 * ver rule 05-naming-size.md, guia de tamanho de arquivo.
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

async function cardExists(userId: string, cardId: string): Promise<boolean> {
  const found = await prisma.card.findFirst({
    where: { id: cardId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

async function countExistingTags(userId: string, tagIds: string[]): Promise<number> {
  if (tagIds.length === 0) return 0;
  return prisma.tag.count({ where: { id: { in: tagIds }, userId, deletedAt: null } });
}

export const transactionOwnership = {
  findCategoryForUser,
  accountExists,
  cardExists,
  countExistingTags,
};
