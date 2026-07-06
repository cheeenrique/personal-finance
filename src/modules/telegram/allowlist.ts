import { prisma } from "@/lib/db/client";

/**
 * Allowlist fixa via env `TELEGRAM_ALLOWED_CHAT_IDS` (docs/30-TELEGRAM.md,
 * "Segurança"): mapa "chatId:userId" separado por vírgula, ex.
 * "123:userA,456:userB". `chat_id` fora da lista = null — rejeição
 * silenciosa, nunca revela ao remetente que o bot existe (ver route.ts).
 */
function parseAllowlist(raw: string): Map<string, string> {
  const entries = raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [chatId, userId] = pair.split(":").map((part) => part.trim());
      return [chatId, userId] as const;
    })
    .filter((entry): entry is [string, string] => Boolean(entry[0]) && Boolean(entry[1]));

  return new Map(entries);
}

/**
 * Fallback LEGADO: resolve via env `TELEGRAM_ALLOWED_CHAT_IDS` (default =
 * env atual — parâmetro existe pra permitir teste isolado sem mexer em
 * `process.env`). Só é consultado quando o `chatId` não está vinculado a
 * nenhum `UserSettings` no banco (ver `resolveUserId`).
 */
function resolveUserIdFromEnv(
  chatId: string | number,
  rawAllowlist: string = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "",
): string | null {
  const allowlist = parseAllowlist(rawAllowlist);
  return allowlist.get(String(chatId)) ?? null;
}

/**
 * Resolve o `userId` autorizado para um `chatId`. Vínculo self-service
 * (`UserSettings.telegramChatId`, docs/12-SETTINGS.md "3. Telegram") tem
 * prioridade; só cai no fallback estático da env
 * (`TELEGRAM_ALLOWED_CHAT_IDS`, legado) se não achar ninguém vinculado no
 * banco.
 */
export async function resolveUserId(chatId: string | number): Promise<string | null> {
  const linked = await prisma.userSettings.findFirst({
    where: { telegramChatId: String(chatId) },
    select: { userId: true },
  });
  if (linked) return linked.userId;

  return resolveUserIdFromEnv(chatId);
}
