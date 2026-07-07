import type { Tag } from "@/generated/prisma/client";
import { tagRepository, type CreateTagData, type UpdateTagData } from "./repository";
import { TagNotFoundError } from "./errors";

async function listTags(userId: string): Promise<Tag[]> {
  return tagRepository.list(userId);
}

async function createTag(userId: string, input: CreateTagData): Promise<Tag> {
  return tagRepository.create(userId, input);
}

/**
 * Find-or-create idempotente por nome (case-insensitive) — usado por
 * integrações que precisam garantir uma tag específica sem duplicar (ex.: tag
 * "Telegram" anexada automaticamente a lançamentos via bot, ver
 * `modules/telegram/telegram-tag.ts`). Sem lock/constraint de unicidade em
 * `Tag.name`: aceitável pro volume de 2 usuários — o webhook do Telegram
 * processa uma mensagem por vez, corrida concorrente duplicando a tag é
 * cenário teórico, não um caller real hoje (rule 02-dry-kiss-yagni, YAGNI).
 */
async function findOrCreateByName(userId: string, name: string, defaultColor: string): Promise<Tag> {
  const existing = await tagRepository.findByNameCI(userId, name);
  if (existing) return existing;
  return tagRepository.create(userId, { name, color: defaultColor });
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

export const tagService = { listTags, createTag, findOrCreateByName, updateTag, deleteTag };
