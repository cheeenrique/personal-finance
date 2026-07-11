import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";

/** Códigos de erro do Postgres via Prisma — ver https://www.prisma.io/docs/orm/reference/error-reference. */
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Dedup por `update_id` (docs/30-TELEGRAM.md): o webhook processa
 * download/Gemini/`createTransaction` de forma síncrona, o que pode passar
 * do timeout de resposta do Telegram — ele reenvia o MESMO update
 * (`update_id`) nesse caso, o que duplicaria a transação sem essa guarda.
 * `update_id` é único por bot; a chave composta `(userId, updateId)` é a
 * garantia correta no modelo multi-bot BYO (cada usuário tem seu próprio
 * bot, então o mesmo `update_id` pode existir em usuários diferentes).
 *
 * `route.ts` chama isto ANTES de qualquer processamento pesado, logo após
 * resolver o usuário pelo secret.
 */
async function markProcessed(userId: string, updateId: number): Promise<{ isDuplicate: boolean }> {
  try {
    await prisma.telegramProcessedUpdate.create({
      data: { userId, updateId: BigInt(updateId) },
    });
    return { isDuplicate: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return { isDuplicate: true };
    }

    // Falha inesperada no insert de dedup (ex.: DB fora do ar) — loga e
    // deixa o fluxo seguir. Melhor arriscar reprocessar do que travar o
    // webhook inteiro por causa de uma tabela auxiliar.
    console.error(`[telegram/dedup] markProcessed failed`, {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return { isDuplicate: false };
  }
}

export const telegramDedupRepository = { markProcessed };
