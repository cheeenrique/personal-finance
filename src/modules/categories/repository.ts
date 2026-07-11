import { prisma } from "@/lib/db/client";
import type { Category } from "@/generated/prisma/client";
import type { CategoryType } from "@/generated/prisma/enums";

export type CreateCategoryData = {
  name: string;
  type: CategoryType;
  icon?: string | null;
  color?: string | null;
  parentId?: string | null;
};

export type UpdateCategoryData = {
  name?: string;
  icon?: string | null;
  color?: string | null;
  parentId?: string | null;
};

/**
 * Acesso a dados do módulo categories. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

async function findById(userId: string, id: string): Promise<Category | null> {
  return prisma.category.findFirst({ where: { id, userId, deletedAt: null } });
}

/** Lista achatada — insumo de `listTree`/checagem de ciclo em service.ts. 1 query pra N categorias, sem N+1. */
async function listAll(userId: string): Promise<Category[]> {
  return prisma.category.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

async function create(userId: string, data: CreateCategoryData): Promise<Category> {
  return prisma.category.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      icon: data.icon ?? null,
      color: data.color ?? null,
      parentId: data.parentId ?? null,
    },
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * categoria de outro usuário mesmo sabendo o `id` (docs/10-AUTH.md, "Regra
 * Principal de Segurança").
 */
async function update(userId: string, id: string, data: UpdateCategoryData): Promise<Category | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.category.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
    },
  });
}

/** Soft delete — nunca remove fisicamente (mesma convenção de accounts, ver modules/accounts/repository.ts). */
async function softDelete(userId: string, id: string): Promise<Category | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.category.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/** Conta filhas ativas — usado por `deleteCategory` pra bloquear exclusão de categoria com subárvore (service.ts). */
async function countChildren(userId: string, parentId: string): Promise<number> {
  return prisma.category.count({ where: { userId, parentId, deletedAt: null } });
}

/**
 * Subconjunto de `ids` que de fato pertence a este userId (não deletado) — 1 query pra N ids,
 * insumo de validação de ownership (ex.: `categoryId` escolhido pelo usuário num import de
 * fatura, ver `modules/imports/service.ts` `commitImport`; docs/10-AUTH.md, isolamento por
 * userId). `ids` de outro usuário simplesmente não voltam no Set — quem chama decide o
 * fallback.
 */
async function findOwnedIds(userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const rows = await prisma.category.findMany({
    where: { userId, deletedAt: null, id: { in: ids } },
    select: { id: true },
  });

  return new Set(rows.map((row) => row.id));
}

export const categoryRepository = {
  findById,
  listAll,
  create,
  update,
  softDelete,
  countChildren,
  findOwnedIds,
};
