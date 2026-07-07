/**
 * Modelo "traga seu próprio bot" (docs/30-TELEGRAM.md): o `userId` dono do
 * update já vem identificado pelo secret per-user do header
 * (`webhook-auth.ts`, `resolveUserByWebhookSecret`) — não existe mais
 * allowlist global (`TELEGRAM_ALLOWED_CHAT_IDS`, legado, removida) nem
 * varredura de `UserSettings` por `chatId`.
 *
 * A única checagem que resta: confirmar que o `chat_id` do update é o MESMO
 * chat vinculado a esse usuário (`UserSettings.telegramChatId`) — só o dono
 * do bot pode comandar o próprio bot. Comando de vínculo (`/vincular`/
 * `/start`) roda ANTES dessa checagem no webhook (`link.ts`, `route.ts`), é
 * assim que um chat_id novo, ainda não vinculado, entra no sistema.
 */
export function isLinkedChat(settings: { telegramChatId: string | null }, chatId: string | number): boolean {
  return settings.telegramChatId !== null && settings.telegramChatId === String(chatId);
}
