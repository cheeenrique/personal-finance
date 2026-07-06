import type { Tag } from "@/generated/prisma/client";
import { tagRepository, type CreateTagData, type UpdateTagData } from "./repository";
import { TagNotFoundError } from "./errors";

async function listTags(userId: string): Promise<Tag[]> {
  return tagRepository.list(userId);
}

async function createTag(userId: string, input: CreateTagData): Promise<Tag> {
  return tagRepository.create(userId, input);
}

async function updateTag(userId: string, id: string, input: UpdateTagData): Promise<Tag> {
  const updated = await tagRepository.update(userId, id, input);
  if (!updated) throw new TagNotFoundError(id);
  return updated;
}

/** Soft delete (schema tem `deletedAt`) — não bloqueia por Transactions existentes; TransactionTag continua referenciando a tag normalmente. */
async function deleteTag(userId: string, id: string): Promise<void> {
  const deleted = await tagRepository.softDelete(userId, id);
  if (!deleted) throw new TagNotFoundError(id);
}

export const tagService = { listTags, createTag, updateTag, deleteTag };
