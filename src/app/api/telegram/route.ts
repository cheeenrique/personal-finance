import { NextResponse, type NextRequest } from "next/server";
import { handleCallbackQuery } from "@/modules/telegram/callback";
import { resolveUserByWebhookSecret } from "@/modules/telegram/webhook-auth";
import { isLinkedChat } from "@/modules/telegram/allowlist";
import { telegramParser } from "@/modules/telegram/parser";
import { telegramHandlers } from "@/modules/telegram/handlers";
import { telegramApi } from "@/modules/telegram/telegram-api";
import { looksLikeLinkCommand, tryLinkFromMessage } from "@/modules/telegram/link";
import { extractLargestPhoto } from "@/modules/telegram/photo";
import { extractDocument } from "@/modules/telegram/document";
import { extractVoiceLike, extractVideoNote } from "@/modules/telegram/voice";
import {
  buildDocumentUnreadableReply,
  buildImageUnreadableReply,
  buildTelegramLinkedReply,
  buildTelegramLinkFailedReply,
  buildUnsupportedMessageReply,
  buildVideoRejectedReply,
  buildVoiceUnreadableReply,
} from "@/modules/telegram/reply";
import type { TelegramPhotoSize } from "@/modules/telegram/types";

const WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Áudios longos demais pra inline no Gemini / UX do bot — pede pra digitar. */
const MAX_VOICE_DURATION_SECONDS = 60;

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    photo?: TelegramPhotoSize[];
    caption?: string;
    document?: { file_id: string; file_name?: string; mime_type?: string };
    voice?: { file_id: string; duration?: number; mime_type?: string };
    audio?: { file_id: string; duration?: number; mime_type?: string; file_name?: string };
    video_note?: { file_id: string; duration?: number };
    video?: { file_id: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
    };
  };
};

/**
 * Foto/voz + Gemini encadeiam requests externas — acima do default Hobby.
 * Voz usa timeout Gemini de 20s; `maxDuration` cobre download + parse.
 */
export const maxDuration = 30;

/**
 * Webhook do Telegram — exceção documentada ao padrão Server Actions
 * (docs/99-CLAUDE.md, docs/30-TELEGRAM.md "Endpoint"): chamado pelo Telegram,
 * não pelo navegador do usuário — sem `auth()` de sessão.
 *
 * Aceita `message` (texto/foto/voz/documento) e `callback_query` (botões
 * inline — docs/30-TELEGRAM.md, fluxo híbrido médio).
 *
 * Sempre responde 200 rápido pro Telegram — inclusive na rejeição
 * silenciosa (chat diferente do vinculado).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secretHeader = request.headers.get(WEBHOOK_SECRET_HEADER);
  const settings = await resolveUserByWebhookSecret(secretHeader);

  if (!settings || !settings.telegramBotToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, telegramBotToken: botToken } = settings;

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;

  if (update?.callback_query) {
    return handleCallbackUpdate(userId, botToken, settings, update.callback_query);
  }

  const chatId = update?.message?.chat?.id;

  if (chatId === undefined || chatId === null) {
    return NextResponse.json({ ok: true });
  }

  const text = update?.message?.text;
  const photoInput = update?.message ? extractLargestPhoto(update.message) : null;
  // Áudio como arquivo (`audio` / `document` .ogg) entra no pipeline de voz —
  // antes ficava mudo (200 sem reply). Documento PDF/foto continua separado.
  const voiceInput = update?.message ? extractVoiceLike(update.message) : null;
  const documentInput =
    !voiceInput && update?.message ? extractDocument(update.message) : null;
  const videoNoteInput = update?.message ? extractVideoNote(update.message) : null;
  const hasRegularVideo = Boolean(update?.message?.video?.file_id);
  const hasUnhandledAttachment = Boolean(
    update?.message?.document?.file_id ||
      update?.message?.audio?.file_id ||
      update?.message?.voice?.file_id,
  );

  if (
    !text &&
    !photoInput &&
    !documentInput &&
    !voiceInput &&
    !videoNoteInput &&
    !hasRegularVideo &&
    !hasUnhandledAttachment
  ) {
    return NextResponse.json({ ok: true });
  }

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
    console.log(`chat_id=${chatId} -> rejected_unauthorized`);
    return NextResponse.json({ ok: true });
  }

  // Vídeo circular / vídeo comum: responde e NÃO processa (antes ficava mudo).
  if (videoNoteInput || hasRegularVideo) {
    await telegramApi.sendMessage(botToken, chatId, buildVideoRejectedReply());
    console.log(`chat_id=${chatId} -> video_rejected`);
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
    await telegramApi.sendMessage(botToken, chatId, result.text, {
      replyMarkup: result.replyMarkup,
    });
    console.log(`chat_id=${chatId} -> ${result.resultCode}`);
    return NextResponse.json({ ok: true });
  }

  if (voiceInput) {
    if (
      voiceInput.durationSeconds !== null &&
      voiceInput.durationSeconds > MAX_VOICE_DURATION_SECONDS
    ) {
      await telegramApi.sendMessage(botToken, chatId, buildVoiceUnreadableReply());
      console.log(`chat_id=${chatId} -> voice_too_long`);
      return NextResponse.json({ ok: true });
    }

    try {
      // downloadVoice grava em /tmp, lê e APAGA no finally — bytes só em memória
      // daqui pra frente.
      const downloaded = await telegramApi.downloadVoice(
        botToken,
        voiceInput.fileId,
        voiceInput.mimeType,
      );

      if (!downloaded) {
        await telegramApi.sendMessage(botToken, chatId, buildVoiceUnreadableReply());
        console.log(`chat_id=${chatId} -> voice_download_failed`);
        return NextResponse.json({ ok: true });
      }

      const result = await telegramHandlers.handleVoiceEntry(
        userId,
        downloaded.bytes,
        downloaded.mimeType,
      );
      await telegramApi.sendMessage(botToken, chatId, result.text, {
        replyMarkup: result.replyMarkup,
      });
      console.log(`chat_id=${chatId} -> ${result.resultCode}`);
    } catch (error) {
      // Exceção não tratada = 500 e Telegram fica mudo — sempre responde.
      console.error(`[api/telegram] voice handler failed`, {
        reason: error instanceof Error ? error.name : "unknown",
      });
      await telegramApi.sendMessage(botToken, chatId, buildVoiceUnreadableReply());
      console.log(`chat_id=${chatId} -> voice_handler_error`);
    }
    return NextResponse.json({ ok: true });
  }

  if (documentInput) {
    const downloaded = await telegramApi.downloadDocument(
      botToken,
      documentInput.fileId,
      documentInput.mimeType,
    );

    if (!downloaded) {
      await telegramApi.sendMessage(botToken, chatId, buildDocumentUnreadableReply());
      console.log(`chat_id=${chatId} -> document_download_failed`);
      return NextResponse.json({ ok: true });
    }

    const result = await telegramHandlers.handleDocumentEntry(
      userId,
      downloaded.bytes,
      downloaded.mimeType,
    );
    await telegramApi.sendMessage(botToken, chatId, result.text, {
      replyMarkup: result.replyMarkup,
    });
    console.log(`chat_id=${chatId} -> ${result.resultCode}`);
    return NextResponse.json({ ok: true });
  }

  if (!text) {
    // Anexo que não casou em nenhum extractor (ex.: document sem mime/extensão
    // conhecida) — responde em vez de 200 mudo.
    if (hasUnhandledAttachment || photoInput || documentInput || voiceInput) {
      await telegramApi.sendMessage(botToken, chatId, buildUnsupportedMessageReply());
      console.log(`chat_id=${chatId} -> unsupported_attachment`);
    }
    return NextResponse.json({ ok: true });
  }

  const command = telegramParser.parseMessage(text);
  const result = await telegramHandlers.executeCommand(userId, command, text);
  await telegramApi.sendMessage(botToken, chatId, result.text, {
    replyMarkup: result.replyMarkup,
  });

  console.log(`chat_id=${chatId} -> ${result.resultCode}`);

  return NextResponse.json({ ok: true });
}

async function handleCallbackUpdate(
  userId: string,
  botToken: string,
  settings: { telegramChatId: string | null },
  callback: NonNullable<TelegramUpdate["callback_query"]>,
): Promise<NextResponse> {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  const data = callback.data;

  if (chatId === undefined || chatId === null || messageId === undefined || !data) {
    await telegramApi.answerCallbackQuery(botToken, callback.id);
    return NextResponse.json({ ok: true });
  }

  if (!isLinkedChat(settings, chatId)) {
    await telegramApi.answerCallbackQuery(botToken, callback.id);
    console.log(`chat_id=${chatId} -> callback_rejected_unauthorized`);
    return NextResponse.json({ ok: true });
  }

  const result = await handleCallbackQuery(userId, data);
  await telegramApi.answerCallbackQuery(botToken, callback.id, result.answerText);

  if (result.clearKeyboard) {
    await telegramApi.editMessageText(botToken, chatId, messageId, result.text, {
      replyMarkup: null,
    });
  } else {
    await telegramApi.editMessageText(botToken, chatId, messageId, result.text, {
      replyMarkup: result.replyMarkup ?? null,
    });
  }

  console.log(`chat_id=${chatId} -> ${result.resultCode}`);
  return NextResponse.json({ ok: true });
}
