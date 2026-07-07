import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import type { TelegramDraft, TelegramMissingField } from "./types";

/** TTL do rascunho pendente (docs/30-TELEGRAM.md, "Fluxo conversacional") — expirado é tratado como se não existisse, a mensagem seguinte vira um lançamento novo. */
const PENDING_TTL_MS = 10 * 60 * 1000;

export type PendingEntry = {
  draft: TelegramDraft;
  missingField: TelegramMissingField;
  attempts: number;
};

/**
 * Rascunho ATIVO (não expirado) do usuário, se houver. Expirado é apagado
 * aqui mesmo (best-effort — nunca bloqueia a leitura) e tratado como
 * inexistente, nunca reaproveitado (docs/30-TELEGRAM.md).
 */
async function getActive(userId: string): Promise<PendingEntry | null> {
  const row = await prisma.telegramPendingEntry.findUnique({ where: { userId } });
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.telegramPendingEntry.delete({ where: { userId } }).catch(() => undefined);
    return null;
  }

  return {
    draft: row.draftJson as unknown as TelegramDraft,
    missingField: row.missingField as TelegramMissingField,
    attempts: row.attempts,
  };
}

/**
 * Idempotente via `upsert` na unique constraint `userId` (mesmo padrão de
 * `modules/settings/repository.ts`) — cada rodada de pergunta SUBSTITUI o
 * rascunho anterior por inteiro, nunca acumula histórico.
 */
async function upsert(
  userId: string,
  draft: TelegramDraft,
  missingField: TelegramMissingField,
  attempts: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
  const draftJson = draft as unknown as Prisma.InputJsonValue;

  await prisma.telegramPendingEntry.upsert({
    where: { userId },
    update: { draftJson, missingField, attempts, expiresAt },
    create: { userId, draftJson, missingField, attempts, expiresAt },
  });
}

/** `deleteMany` (não `delete`) — idempotente, nunca lança se já não houver pending (ver `draft.ts`, chamado tanto no caminho feliz quanto no cancelamento/desistência). */
async function remove(userId: string): Promise<void> {
  await prisma.telegramPendingEntry.deleteMany({ where: { userId } });
}

export const telegramPendingRepository = { getActive, upsert, remove };
