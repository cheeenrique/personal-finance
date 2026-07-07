/**
 * Cliente fino sobre a API do Telegram — modelo "traga seu próprio bot"
 * (docs/30-TELEGRAM.md): não existe mais `TELEGRAM_BOT_TOKEN` único via env,
 * cada usuário tem seu bot e o token vem de `UserSettings.telegramBotToken`
 * (nunca lido daqui — o caller sempre passa o token explícito).
 */

type GetMeResult = { ok: boolean; username?: string };
type SetWebhookResult = { ok: true } | { ok: false; error: string };

/** Nunca loga `text` (docs/30-TELEGRAM.md, "Segurança": nunca logar corpo da mensagem nem valores monetários). */
async function sendMessage(botToken: string, chatId: string | number, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    console.error(`[modules/telegram] falha ao enviar mensagem (chat_id=${chatId}, status=${response.status})`);
  }
}

/**
 * Valida um token de bot chamando `getMe` — usado na instalação
 * (`installTelegramBot`, modules/settings/service.ts) antes de gravar
 * qualquer coisa no banco. Token malformado/revogado/inexistente = `ok: false`
 * (nunca lança — o caller decide o erro de domínio).
 */
async function getMe(botToken: string): Promise<GetMeResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; result?: { username?: string } }
      | null;

    if (!response.ok || !body?.ok || !body.result?.username) return { ok: false };
    return { ok: true, username: body.result.username };
  } catch {
    return { ok: false };
  }
}

/**
 * Registra o webhook per-user do bot. O Telegram rejeita `url` sem HTTPS
 * público (ex.: `localhost` em dev) — tratamos isso como erro de negócio
 * comum, nunca deixamos a exceção subir crua (`installTelegramBot` decide o
 * que fazer com o resultado: salva o token mesmo se o webhook falhar).
 */
async function setWebhook(botToken: string, url: string, secret: string): Promise<SetWebhookResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: secret }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.description ?? `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/** Best-effort — usado na desinstalação (`uninstallTelegramBot`). Falha aqui nunca deve bloquear a limpeza do banco. */
async function deleteWebhook(botToken: string): Promise<void> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, { method: "POST" });
    if (!response.ok) {
      console.error(`[modules/telegram] falha ao remover webhook (status=${response.status})`);
    }
  } catch (error) {
    console.error("[modules/telegram] erro ao remover webhook", error);
  }
}

export const telegramApi = { sendMessage, getMe, setWebhook, deleteWebhook };
