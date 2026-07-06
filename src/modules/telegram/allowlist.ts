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
 * Resolve o `userId` autorizado para um `chatId`. Aceita `rawAllowlist`
 * explícito (default = env `TELEGRAM_ALLOWED_CHAT_IDS`) — parâmetro existe
 * pra permitir teste isolado sem mexer em `process.env`.
 */
export function resolveUserId(
  chatId: string | number,
  rawAllowlist: string = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "",
): string | null {
  const allowlist = parseAllowlist(rawAllowlist);
  return allowlist.get(String(chatId)) ?? null;
}
