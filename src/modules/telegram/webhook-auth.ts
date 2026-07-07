import { prisma } from "@/lib/db/client";
import type { UserSettings } from "@/generated/prisma/client";

/**
 * Resolve QUAL usuário é dono do bot que recebeu o update, a partir do
 * secret per-user configurado no `setWebhook` (modules/settings/service.ts
 * `installTelegramBot`) — modelo "traga seu próprio bot"
 * (docs/30-TELEGRAM.md): não existe mais um `TELEGRAM_WEBHOOK_SECRET` global,
 * cada usuário tem seu próprio bot + secret gravados em
 * `UserSettings.telegramWebhookSecret` (`@unique`).
 *
 * Sem header ou sem match no banco = `null` (fail closed) — o caller
 * (route.ts) descarta com 401 sem processar nada.
 */
export async function resolveUserByWebhookSecret(headerValue: string | null): Promise<UserSettings | null> {
  if (!headerValue) return null;
  return prisma.userSettings.findUnique({ where: { telegramWebhookSecret: headerValue } });
}
