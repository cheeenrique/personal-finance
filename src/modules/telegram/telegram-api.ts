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

/** Timeout pra chamadas de arquivo (docs/30-TELEGRAM.md — extração por Gemini vision): foto de nota é pequena, mas ambas são requests externas e não podem travar o webhook. */
const FILE_REQUEST_TIMEOUT_MS = 8000;

/** Telegram sempre recomprime `message.photo` como JPEG — mimeType fixo, sem depender da extensão do `file_path`. */
const PHOTO_MIME_TYPE = "image/jpeg";

/**
 * Resolve o `file_path` de um `file_id` (1º passo pra baixar uma foto — ver
 * `downloadPhoto` abaixo). `file_path` do Telegram expira após um tempo;
 * `ok: false` em qualquer falha (expirado, `file_id` inválido, rede, timeout)
 * — nunca lança, o caller decide a resposta amigável.
 */
async function getFile(botToken: string, fileId: string): Promise<{ ok: true; filePath: string } | { ok: false }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FILE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: controller.signal },
    );
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; result?: { file_path?: string } }
      | null;

    if (!response.ok || !body?.ok || !body.result?.file_path) return { ok: false };
    return { ok: true, filePath: body.result.file_path };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

/** Baixa os bytes de um `file_path` já resolvido por `getFile` — arquivo servido em `https://api.telegram.org/file/bot<TOKEN>/<file_path>` (mesmo token do bot, BYO-bot). */
async function downloadFileBytes(botToken: string, filePath: string): Promise<{ ok: true; bytes: Buffer } | { ok: false }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FILE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false };

    const arrayBuffer = await response.arrayBuffer();
    return { ok: true, bytes: Buffer.from(arrayBuffer) };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Orquestra `getFile` + download dos bytes de uma foto do Telegram
 * (docs/30-TELEGRAM.md — extração por Gemini vision). `null` em qualquer
 * falha (arquivo expirado, rede, timeout) — o caller (`handlers.ts` via
 * `route.ts`) sempre tem uma resposta amigável pra esse caso, nunca deixa o
 * webhook quebrar por causa de uma foto que não baixou. Nunca loga bytes nem
 * o token (a URL completa nunca é logada em nenhum ponto desta função).
 */
async function downloadPhoto(botToken: string, fileId: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const file = await getFile(botToken, fileId);
  if (!file.ok) return null;

  const download = await downloadFileBytes(botToken, file.filePath);
  if (!download.ok) return null;

  return { bytes: download.bytes, mimeType: PHOTO_MIME_TYPE };
}

/**
 * Orquestra `getFile` + download dos bytes de um DOCUMENTO do Telegram
 * (docs/30-TELEGRAM.md — ingestão de contrato/CCB de financiamento por
 * Gemini). Mesmo racional de `downloadPhoto`, mas o `mimeType` não é fixo
 * (documento pode ser PDF ou imagem) — o caller (`route.ts`, via
 * `extractDocument`, `document.ts`) já resolveu o mimeType do `message.document`
 * e só passa pra cá pra manter o shape de retorno simétrico ao de
 * `downloadPhoto` (`{ bytes, mimeType }`). `null` em qualquer falha (arquivo
 * expirado, rede, timeout) — mesma garantia de nunca derrubar o webhook.
 * Nunca loga bytes nem o token.
 */
async function downloadDocument(
  botToken: string,
  fileId: string,
  mimeType: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const file = await getFile(botToken, fileId);
  if (!file.ok) return null;

  const download = await downloadFileBytes(botToken, file.filePath);
  if (!download.ok) return null;

  return { bytes: download.bytes, mimeType };
}

export const telegramApi = { sendMessage, getMe, setWebhook, deleteWebhook, downloadPhoto, downloadDocument };
