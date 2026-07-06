/**
 * Envia mensagem de texto via API do Telegram (`sendMessage`). Sem
 * `TELEGRAM_BOT_TOKEN` configurado (dev) — loga em vez de chamar a rede, pra
 * não quebrar o fluxo local. Nunca loga `text` (docs/30-TELEGRAM.md,
 * "Segurança": nunca logar corpo da mensagem nem valores monetários).
 */
async function sendMessage(chatId: string | number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log(`[modules/telegram] TELEGRAM_BOT_TOKEN ausente — mensagem não enviada (chat_id=${chatId})`);
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    console.error(`[modules/telegram] falha ao enviar mensagem (chat_id=${chatId}, status=${response.status})`);
  }
}

export const telegramApi = { sendMessage };
