import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";

/** Códigos de erro do Postgres via Prisma — ver https://www.prisma.io/docs/orm/reference/error-reference. */
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Reconhece `/vincular <CODE>` (comando explícito) OU `/start <CODE>` (deep
 * link do Telegram `t.me/<bot>?start=<code>` chega como essa mensagem) —
 * case-insensitive, um único token de código sem espaço.
 */
const LINK_COMMAND_PATTERN = /^\/(vincular|start)\s+(\S+)$/i;

export type TelegramLinkResult =
  | { ok: true }
  | { ok: false; reason: "invalid_command" | "invalid_or_expired_code" | "chat_already_linked" };

/**
 * Checagem barata pra decidir, no webhook, se vale tentar o vínculo ANTES da
 * checagem de chat vinculado (`isLinkedChat`, allowlist.ts) — um `chat_id`
 * novo (ainda não vinculado a esse bot) só entra no sistema passando por
 * aqui primeiro (ver route.ts).
 */
export function looksLikeLinkCommand(text: string): boolean {
  const firstWord = text.trim().split(/\s+/)[0]?.toLowerCase();
  return firstWord === "/vincular" || firstWord === "/start";
}

/**
 * Vincula um `chat_id` ao usuário dono do código de vínculo
 * (docs/12-SETTINGS.md, "3. Telegram"). Roda antes da checagem de chat
 * vinculado no webhook (docs/30-TELEGRAM.md, "Segurança") — é assim que um
 * chat_id novo passa a existir em `UserSettings.telegramChatId`.
 *
 * `userId` é o dono do bot que recebeu o update (já resolvido pelo secret
 * per-user do webhook, ver `webhook-auth.ts`) — o código é validado CONTRA
 * ESSE usuário, nunca buscado globalmente: no modelo "traga seu próprio bot"
 * cada usuário só pode confirmar o próprio código mandando pro próprio bot.
 */
export async function tryLinkFromMessage(
  userId: string,
  chatId: string | number,
  text: string,
): Promise<TelegramLinkResult> {
  const match = LINK_COMMAND_PATTERN.exec(text.trim());
  if (!match) return { ok: false, reason: "invalid_command" };

  const code = match[2].toUpperCase();

  const settings = await prisma.userSettings.findFirst({
    where: { userId, telegramLinkCode: code, telegramLinkCodeExpiresAt: { gt: new Date() } },
  });
  if (!settings) return { ok: false, reason: "invalid_or_expired_code" };

  try {
    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { telegramChatId: String(chatId), telegramLinkCode: null, telegramLinkCodeExpiresAt: null },
    });
    return { ok: true };
  } catch (error) {
    // Chat já vinculado a OUTRO usuário (unique constraint) — raro, mas tratado como reason específica em vez de 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return { ok: false, reason: "chat_already_linked" };
    }
    throw error;
  }
}
