import { NextResponse, type NextRequest } from "next/server";
import { resolveUserByWebhookSecret } from "@/modules/telegram/webhook-auth";
import { isLinkedChat } from "@/modules/telegram/allowlist";
import { telegramParser } from "@/modules/telegram/parser";
import { telegramHandlers } from "@/modules/telegram/handlers";
import { telegramApi } from "@/modules/telegram/telegram-api";
import { looksLikeLinkCommand, tryLinkFromMessage } from "@/modules/telegram/link";
import { buildTelegramLinkedReply, buildTelegramLinkFailedReply } from "@/modules/telegram/reply";

const WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
};

/**
 * Webhook do Telegram — exceção documentada ao padrão Server Actions
 * (docs/99-CLAUDE.md, docs/30-TELEGRAM.md "Endpoint"): chamado pelo Telegram,
 * não pelo navegador do usuário — sem `auth()` de sessão.
 *
 * Modelo "traga seu próprio bot": cada usuário tem seu próprio bot + secret
 * (`UserSettings.telegramBotToken`/`telegramWebhookSecret`) — o header
 * `X-Telegram-Bot-Api-Secret-Token` identifica DE QUEM é esse update
 * (`resolveUserByWebhookSecret`), substituindo o antigo secret único global.
 *
 * Sempre responde 200 rápido pro Telegram — inclusive na rejeição
 * silenciosa (chat diferente do vinculado) — pra nunca deixar o Telegram
 * re-tentar a entrega por timeout nem revelar ao remetente desconhecido que
 * o bot existe.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secretHeader = request.headers.get(WEBHOOK_SECRET_HEADER);
  const settings = await resolveUserByWebhookSecret(secretHeader);

  if (!settings || !settings.telegramBotToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, telegramBotToken: botToken } = settings;

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text;

  if (chatId === undefined || chatId === null || !text) {
    return NextResponse.json({ ok: true });
  }

  // Comando de vínculo (`/vincular <CODE>` ou `/start <CODE>`) roda ANTES da
  // checagem de chat vinculado — é assim que um chat_id novo, ainda não
  // vinculado a esse bot, entra no sistema (docs/12-SETTINGS.md, "3. Telegram").
  if (looksLikeLinkCommand(text)) {
    const linkResult = await tryLinkFromMessage(userId, chatId, text);

    if (linkResult.ok) {
      await telegramApi.sendMessage(botToken, chatId, buildTelegramLinkedReply());
      console.log(`chat_id=${chatId} -> telegram_linked`);
    } else {
      await telegramApi.sendMessage(botToken, chatId, buildTelegramLinkFailedReply());
      console.log(`chat_id=${chatId} -> link_failed_${linkResult.reason}`);
    }

    return NextResponse.json({ ok: true });
  }

  if (!isLinkedChat(settings, chatId)) {
    // Rejeição silenciosa (docs/30-TELEGRAM.md, "Segurança"): 200 vazio, sem
    // processar nem responder ao remetente.
    console.log(`chat_id=${chatId} -> rejected_unauthorized`);
    return NextResponse.json({ ok: true });
  }

  const command = telegramParser.parseMessage(text);
  const result = await telegramHandlers.executeCommand(userId, command, text);
  await telegramApi.sendMessage(botToken, chatId, result.text);

  // Log só chat_id + resultado — nunca corpo da mensagem nem valores (docs/30-TELEGRAM.md, "Segurança").
  console.log(`chat_id=${chatId} -> ${result.resultCode}`);

  return NextResponse.json({ ok: true });
}
