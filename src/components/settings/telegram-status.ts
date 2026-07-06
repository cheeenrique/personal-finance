/**
 * Resolve o `chat_id` do Telegram vinculado ao usuário logado, direto da
 * allowlist (env `TELEGRAM_ALLOWED_CHAT_IDS`) — nunca do `UserSettings`
 * (docs/12-SETTINGS.md, "3. Telegram": "`chat_id` é read-only nesta tela").
 *
 * Mesmo formato de parsing de `modules/telegram/allowlist.ts`
 * (`"chatId:userId"` separado por vírgula), só que na direção reversa
 * (userId -> chatId) — essa função não existe lá hoje. Duplicação pequena e
 * isolada nesta tela (fora do escopo desta task mexer em `modules/`); ver
 * "Improvement Suggestions" no resumo final para extrair um helper
 * compartilhado se um segundo consumidor aparecer (rule 02-dry-kiss-yagni).
 */
export function resolveTelegramChatId(
  userId: string,
  rawAllowlist: string = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "",
): string | null {
  const match = rawAllowlist
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [chatId, ownerId] = pair.split(":").map((part) => part.trim());
      return { chatId, ownerId };
    })
    .find((pair) => pair.ownerId === userId);

  return match?.chatId ?? null;
}
