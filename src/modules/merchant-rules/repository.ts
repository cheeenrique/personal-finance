import { prisma } from "@/lib/db/client";
import type { MerchantCategoryRule } from "@/generated/prisma/client";

export type CreateMerchantCategoryRuleData = { pattern: string; categoryId: string };

/**
 * Acesso a dados do módulo merchant-rules. SEMPRE escopado por `userId` +
 * `deletedAt: null` (docs/03-DATABASE.md, "Princípio Principal").
 */

async function findById(userId: string, id: string): Promise<MerchantCategoryRule | null> {
  return prisma.merchantCategoryRule.findFirst({ where: { id, userId, deletedAt: null } });
}

/** Lista pra UI (ordenada) — /settings, listar/criar/excluir regras. */
async function listByUser(userId: string): Promise<MerchantCategoryRule[]> {
  return prisma.merchantCategoryRule.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } });
}

/**
 * Regras ATIVAS do usuário — insumo ÚNICO de `resolveCategoryOverride`
 * (service.ts): 1 query por resolução, sem N+1. Separada de `listByUser` de
 * propósito (mesmo shape hoje, mas consumidores diferentes — resolve não
 * precisa de ordenação, UI precisa; evita acoplar os dois casos de uso).
 */
async function findActiveByUser(userId: string): Promise<MerchantCategoryRule[]> {
  return prisma.merchantCategoryRule.findMany({ where: { userId, deletedAt: null } });
}

async function create(userId: string, data: CreateMerchantCategoryRuleData): Promise<MerchantCategoryRule> {
  return prisma.merchantCategoryRule.create({
    data: { userId, pattern: data.pattern, categoryId: data.categoryId },
  });
}

/** Soft delete — mesma convenção de tags/categories/accounts. */
async function softDelete(userId: string, id: string): Promise<MerchantCategoryRule | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.merchantCategoryRule.update({ where: { id }, data: { deletedAt: new Date() } });
}

export const merchantRuleRepository = { findById, listByUser, findActiveByUser, create, softDelete };
