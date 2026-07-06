/**
 * Valida o header `X-Telegram-Bot-Api-Secret-Token` contra
 * `TELEGRAM_WEBHOOK_SECRET` (docs/30-TELEGRAM.md, "Segurança"). Função
 * isolada — sem `Request`/`Response` — pra poder testar sem subir HTTP real.
 * Secret ausente no ambiente = sempre inválido (fail closed).
 */
export function isValidWebhookSecret(
  headerValue: string | null,
  expectedSecret: string | undefined = process.env.TELEGRAM_WEBHOOK_SECRET,
): boolean {
  if (!expectedSecret) return false;
  return headerValue === expectedSecret;
}
