import { prisma } from "@/lib/db/client";
import type { Tag } from "@/generated/prisma/client";

export type CreateTagData = { name: string; color: string };
export type UpdateTagData = Partial<CreateTagData>;

/**
 * Acesso a dados do módulo tags. SEMPRE escopado por `userId` +
 * `deletedAt: null` (docs/03-DATABASE.md, "Princípio Principal").
 */

async function findById(userId: string, id: string): Promise<Tag | null> {
  return prisma.tag.findFirst({ where: { id, userId, deletedAt: null } });
}

async function list(userId: string): Promise<Tag[]> {
  return prisma.tag.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } });
}

async function create(userId: string, data: CreateTagData): Promise<Tag> {
  return prisma.tag.create({ data: { userId, name: data.name, color: data.color } });
}

async function update(userId: string, id: string, data: UpdateTagData): Promise<Tag | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.tag.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.color !== undefined && { color: data.color }),
    },
  });
}

/** Soft delete — `Tag` tem `deletedAt` no schema (prisma/schema.prisma), mesma convenção de accounts/categories. */
async function softDelete(userId: string, id: string): Promise<Tag | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.tag.update({ where: { id }, data: { deletedAt: new Date() } });
}

export const tagRepository = { findById, list, create, update, softDelete };
