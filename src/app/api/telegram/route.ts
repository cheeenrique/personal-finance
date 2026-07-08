import { NextResponse, type NextRequest } from "next/server";
import { resolveUserByWebhookSecret } from "@/modules/telegram/webhook-auth";
import { isLinkedChat } from "@/modules/telegram/allowlist";
import { telegramParser } from "@/modules/telegram/parser";
import { telegramHandlers } from "@/modules/telegram/handlers";
import { telegramApi } from "@/modules/telegram/telegram-api";
import { looksLikeLinkCommand, tryLinkFromMessage } from "@/modules/telegram/link";
import { extractLargestPhoto } from "@/modules/telegram/photo";
import { extractDocument } from "@/modules/telegram/document";
import {
  buildDocumentUnreadableReply,
  buildImageUnreadableReply,
  buildTelegramLinkedReply,
  buildTelegramLinkFailedReply,
} from "@/modules/telegram/reply";
import type { TelegramPhotoSize } from "@/modules/telegram/types";

const WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    photo?: TelegramPhotoSize[];
    caption?: string;
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
};

/**
 * Foto de nota/comprovante + a chamada Gemini vision encadeiam 2 requests
 * externas (download do Telegram + `generateContent`, ~8s de timeout cada —
 * ver `telegram-api.ts`/`ai-parser.ts`) — acima do default de function
 * duration do Vercel Hobby (docs/01-STACK.md). `maxDuration` evita timeout
 * silencioso do webhook nesse caminho.
 */
export const maxDuration = 30;

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

  if (chatId === undefined || chatId === null) {
    return NextResponse.json({ ok: true });
  }

  const text = update?.message?.text;
  // Foto de nota/comprovante/notificação (docs/30-TELEGRAM.md, bot aceita
  // foto) — `message.photo` é um array de tamanhos, `extractLargestPhoto`
  // (função pura, `photo.ts`) já resolve a maior resolução + o `caption`
  // opcional. `null` quando a mensagem não tem foto nenhuma.
  const photoInput = update?.message ? extractLargestPhoto(update.message) : null;
  // Documento (PDF ou foto do contrato/CCB de financiamento, docs/30-TELEGRAM.md
  // — ingestão por documento, `financing-parser.ts`) — `extractDocument`
  // (função pura, `document.ts`) resolve o mimeType (`mime_type` do Telegram ou
  // fallback por extensão do `file_name`). `null` quando a mensagem não tem
  // `document` ou quando nenhum mimeType dá pra resolver.
  const documentInput = update?.message ? extractDocument(update.message) : null;

  if (!text && !photoInput && !documentInput) {
    return NextResponse.json({ ok: true });
  }

  // Comando de vínculo (`/vincular <CODE>` ou `/start <CODE>`) roda ANTES da
  // checagem de chat vinculado — é assim que um chat_id novo, ainda não
  // vinculado a esse bot, entra no sistema (docs/12-SETTINGS.md, "3. Telegram").
  // Só se aplica a mensagens de TEXTO — o Telegram nunca manda um comando via foto.
  if (text && looksLikeLinkCommand(text)) {
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

  if (photoInput) {
    const downloaded = await telegramApi.downloadPhoto(botToken, photoInput.fileId);

    if (!downloaded) {
      await telegramApi.sendMessage(botToken, chatId, buildImageUnreadableReply());
      console.log(`chat_id=${chatId} -> image_download_failed`);
      return NextResponse.json({ ok: true });
    }

    const result = await telegramHandlers.handleImageEntry(
      userId,
      downloaded.bytes,
      downloaded.mimeType,
      photoInput.caption,
    );
    await telegramApi.sendMessage(botToken, chatId, result.text);
    console.log(`chat_id=${chatId} -> ${result.resultCode}`);
    return NextResponse.json({ ok: true });
  }

  if (documentInput) {
    const downloaded = await telegramApi.downloadDocument(botToken, documentInput.fileId, documentInput.mimeType);

    if (!downloaded) {
      await telegramApi.sendMessage(botToken, chatId, buildDocumentUnreadableReply());
      console.log(`chat_id=${chatId} -> document_download_failed`);
      return NextResponse.json({ ok: true });
    }

    const result = await telegramHandlers.handleDocumentEntry(userId, downloaded.bytes, downloaded.mimeType);
    await telegramApi.sendMessage(botToken, chatId, result.text);
    console.log(`chat_id=${chatId} -> ${result.resultCode}`);
    return NextResponse.json({ ok: true });
  }

  if (!text) {
    // Inalcançável na prática (mensagem sem foto E sem texto já retornou
    // acima) — guarda só pra o compilador não exigir non-null assertion.
    return NextResponse.json({ ok: true });
  }

  const command = telegramParser.parseMessage(text);
  const result = await telegramHandlers.executeCommand(userId, command, text);
  await telegramApi.sendMessage(botToken, chatId, result.text);

  // Log só chat_id + resultado — nunca corpo da mensagem nem valores (docs/30-TELEGRAM.md, "Segurança").
  console.log(`chat_id=${chatId} -> ${result.resultCode}`);

  return NextResponse.json({ ok: true });
}
