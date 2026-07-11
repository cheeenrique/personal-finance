import { NextResponse, type NextRequest } from "next/server";
import { handleCallbackQuery } from "@/modules/telegram/callback";
import { resolveUserByWebhookSecret } from "@/modules/telegram/webhook-auth";
import { isLinkedChat } from "@/modules/telegram/allowlist";
import { telegramDedupRepository } from "@/modules/telegram/dedup";
import { telegramParser } from "@/modules/telegram/parser";
import { telegramHandlers } from "@/modules/telegram/handlers";
import { telegramApi } from "@/modules/telegram/telegram-api";
import { looksLikeLinkCommand, tryLinkFromMessage } from "@/modules/telegram/link";
import { extractLargestPhoto } from "@/modules/telegram/photo";
import { extractDocument } from "@/modules/telegram/document";
import { extractVoiceLike, extractVideoNote } from "@/modules/telegram/voice";
import {
  buildDocumentUnreadableReply,
  buildErrorReply,
  buildImageUnreadableReply,
  buildTelegramLinkedReply,
  buildTelegramLinkFailedReply,
  buildUnsupportedMessageReply,
  buildVideoRejectedReply,
  buildVoiceUnreadableReply,
} from "@/modules/telegram/reply";
import type {
  TelegramDocumentInput,
  TelegramPhotoInput,
  TelegramPhotoSize,
  TelegramReplyMarkup,
  TelegramVoiceInput,
} from "@/modules/telegram/types";
import type { UserSettings } from "@/generated/prisma/client";

const WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Áudios longos demais pra inline no Gemini / UX do bot — pede pra digitar. */
const MAX_VOICE_DURATION_SECONDS = 60;

type TelegramUpdate = {
  update_id?: number;
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

  // Dedup por `update_id` (docs/30-TELEGRAM.md): o Telegram reenvia o MESMO
  // update se não receber 200 a tempo — download + Gemini + createTransaction
  // rodam síncronos abaixo e podem passar do timeout dele. Roda ANTES de
  // qualquer processamento pesado, pra qualquer tipo de update (message ou
  // callback_query).
  if (update?.update_id !== undefined && update.update_id !== null) {
    const { isDuplicate } = await telegramDedupRepository.markProcessed(userId, update.update_id);

    if (isDuplicate) {
      const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? "unknown";
      console.log(`chat_id=${chatId} -> duplicate_update_skipped`);
      return NextResponse.json({ ok: true });
    }
  }

  // Boundary de erro final: NENHUM caminho abaixo pode resultar em 500 pro
  // Telegram (senão ele reenvia o update e, sem o dedup acima cobrir o
  // próximo update_id, a próxima falha ainda vale a pena não derrubar aqui).
  // Os try/catch e replies específicos por caminho (voz, etc.) continuam
  // valendo — isto é só a rede de segurança final.
  try {
    return await dispatchUpdate(userId, botToken, settings, update);
  } catch (error) {
    console.error(`[api/telegram] dispatch failed`, {
      reason: error instanceof Error ? error.name : "unknown",
    });

    const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;

    if (chatId !== undefined && chatId !== null) {
      try {
        await telegramApi.sendMessage(
          botToken,
          chatId,
          buildErrorReply("Não foi possível processar sua mensagem agora."),
        );
      } catch {
        // Já estamos no boundary final — se o próprio send falhar, engole.
      }
    }

    return NextResponse.json({ ok: true });
  }
}

/** Conteúdo de `message` já extraído/normalizado pra decidir o caminho de processamento (ver `extractUpdateContext`). */
type UpdateContext = {
  text?: string;
  photoInput: TelegramPhotoInput | null;
  voiceInput: TelegramVoiceInput | null;
  documentInput: TelegramDocumentInput | null;
  videoNoteInput: { fileId: string } | null;
  hasRegularVideo: boolean;
  hasUnhandledAttachment: boolean;
};

/**
 * Orquestrador do webhook: decide o caminho de um `message` (link → allowlist
 * → vídeo → foto → voz → documento → anexo não suportado → texto) chamando
 * um passo por vez, NA MESMA ORDEM de sempre — cada passo devolve `null`
 * quando não se aplica (segue pro próximo) ou a `NextResponse` final.
 */
async function dispatchUpdate(
  userId: string,
  botToken: string,
  settings: UserSettings,
  update: TelegramUpdate | null,
): Promise<NextResponse> {
  if (update?.callback_query) {
    return handleCallbackUpdate(userId, botToken, settings, update.callback_query);
  }

  const chatId = update?.message?.chat?.id;

  if (chatId === undefined || chatId === null) {
    return NextResponse.json({ ok: true });
  }

  const context = extractUpdateContext(update);

  if (hasNoRecognizedContent(context)) {
    return NextResponse.json({ ok: true });
  }

  const linkResponse = await handleLinkCommand(userId, botToken, chatId, context.text);
  if (linkResponse) return linkResponse;

  const allowlistResponse = checkAllowlist(settings, chatId);
  if (allowlistResponse) return allowlistResponse;

  const videoResponse = await handleVideoUpdate(botToken, chatId, context.videoNoteInput, context.hasRegularVideo);
  if (videoResponse) return videoResponse;

  const photoResponse = await handlePhotoUpdate(userId, botToken, chatId, context.photoInput);
  if (photoResponse) return photoResponse;

  const voiceResponse = await handleVoiceUpdate(userId, botToken, chatId, context.voiceInput);
  if (voiceResponse) return voiceResponse;

  const documentResponse = await handleDocumentUpdate(userId, botToken, chatId, context.documentInput);
  if (documentResponse) return documentResponse;

  const unsupportedResponse = await handleUnsupportedAttachment(botToken, chatId, context);
  if (unsupportedResponse) return unsupportedResponse;

  // `handleUnsupportedAttachment` só devolve `null` quando `context.text` é
  // truthy (mesma garantia do `if (!text)` original) — `!` só narrowa pro TS.
  return handleTextUpdate(userId, botToken, chatId, context.text!);
}

function extractUpdateContext(update: TelegramUpdate | null): UpdateContext {
  const text = update?.message?.text;
  const photoInput = update?.message ? extractLargestPhoto(update.message) : null;
  // Áudio como arquivo (`audio` / `document` .ogg) entra no pipeline de voz —
  // antes ficava mudo (200 sem reply). Documento PDF/foto continua separado.
  const voiceInput = update?.message ? extractVoiceLike(update.message) : null;
  const documentInput = !voiceInput && update?.message ? extractDocument(update.message) : null;
  const videoNoteInput = update?.message ? extractVideoNote(update.message) : null;
  const hasRegularVideo = Boolean(update?.message?.video?.file_id);
  const hasUnhandledAttachment = Boolean(
    update?.message?.document?.file_id ||
      update?.message?.audio?.file_id ||
      update?.message?.voice?.file_id,
  );

  return { text, photoInput, voiceInput, documentInput, videoNoteInput, hasRegularVideo, hasUnhandledAttachment };
}

function hasNoRecognizedContent(context: UpdateContext): boolean {
  return (
    !context.text &&
    !context.photoInput &&
    !context.documentInput &&
    !context.voiceInput &&
    !context.videoNoteInput &&
    !context.hasRegularVideo &&
    !context.hasUnhandledAttachment
  );
}

async function handleLinkCommand(
  userId: string,
  botToken: string,
  chatId: number | string,
  text: string | undefined,
): Promise<NextResponse | null> {
  if (!text || !looksLikeLinkCommand(text)) return null;

  const linkResult = await tryLinkFromMessage(userId, chatId, text);

  if (linkResult.ok) {
    return replyAndAck(botToken, chatId, buildTelegramLinkedReply(), "telegram_linked");
  }

  return replyAndAck(botToken, chatId, buildTelegramLinkFailedReply(), `link_failed_${linkResult.reason}`);
}

function checkAllowlist(
  settings: { telegramChatId: string | null },
  chatId: number | string,
): NextResponse | null {
  if (isLinkedChat(settings, chatId)) return null;

  console.log(`chat_id=${chatId} -> rejected_unauthorized`);
  return NextResponse.json({ ok: true });
}

/** Vídeo circular / vídeo comum: responde e NÃO processa (antes ficava mudo). */
async function handleVideoUpdate(
  botToken: string,
  chatId: number | string,
  videoNoteInput: { fileId: string } | null,
  hasRegularVideo: boolean,
): Promise<NextResponse | null> {
  if (!videoNoteInput && !hasRegularVideo) return null;

  return replyAndAck(botToken, chatId, buildVideoRejectedReply(), "video_rejected");
}

async function handlePhotoUpdate(
  userId: string,
  botToken: string,
  chatId: number | string,
  photoInput: TelegramPhotoInput | null,
): Promise<NextResponse | null> {
  if (!photoInput) return null;

  const downloaded = await telegramApi.downloadPhoto(botToken, photoInput.fileId);

  if (!downloaded) {
    return replyAndAck(botToken, chatId, buildImageUnreadableReply(), "image_download_failed");
  }

  const result = await telegramHandlers.handleImageEntry(
    userId,
    downloaded.bytes,
    downloaded.mimeType,
    photoInput.caption,
  );
  return replyAndAck(botToken, chatId, result.text, result.resultCode, result.replyMarkup);
}

async function handleVoiceUpdate(
  userId: string,
  botToken: string,
  chatId: number | string,
  voiceInput: TelegramVoiceInput | null,
): Promise<NextResponse | null> {
  if (!voiceInput) return null;

  if (voiceInput.durationSeconds !== null && voiceInput.durationSeconds > MAX_VOICE_DURATION_SECONDS) {
    return replyAndAck(botToken, chatId, buildVoiceUnreadableReply(), "voice_too_long");
  }

  try {
    // downloadVoice grava em /tmp, lê e APAGA no finally — bytes só em memória
    // daqui pra frente.
    const downloaded = await telegramApi.downloadVoice(botToken, voiceInput.fileId, voiceInput.mimeType);

    if (!downloaded) {
      return replyAndAck(botToken, chatId, buildVoiceUnreadableReply(), "voice_download_failed");
    }

    const result = await telegramHandlers.handleVoiceEntry(userId, downloaded.bytes, downloaded.mimeType);
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

async function handleDocumentUpdate(
  userId: string,
  botToken: string,
  chatId: number | string,
  documentInput: TelegramDocumentInput | null,
): Promise<NextResponse | null> {
  if (!documentInput) return null;

  const downloaded = await telegramApi.downloadDocument(botToken, documentInput.fileId, documentInput.mimeType);

  if (!downloaded) {
    return replyAndAck(botToken, chatId, buildDocumentUnreadableReply(), "document_download_failed");
  }

  const result = await telegramHandlers.handleDocumentEntry(userId, downloaded.bytes, downloaded.mimeType);
  return replyAndAck(botToken, chatId, result.text, result.resultCode, result.replyMarkup);
}

/**
 * Anexo que não casou em nenhum extractor (ex.: document sem mime/extensão
 * conhecida) — responde em vez de 200 mudo. `null` quando `text` é truthy —
 * segue pro caminho de texto (`handleTextUpdate`).
 */
async function handleUnsupportedAttachment(
  botToken: string,
  chatId: number | string,
  context: UpdateContext,
): Promise<NextResponse | null> {
  if (context.text) return null;

  if (context.hasUnhandledAttachment || context.photoInput || context.documentInput || context.voiceInput) {
    return replyAndAck(botToken, chatId, buildUnsupportedMessageReply(), "unsupported_attachment");
  }

  return NextResponse.json({ ok: true });
}

async function handleTextUpdate(
  userId: string,
  botToken: string,
  chatId: number | string,
  text: string,
): Promise<NextResponse> {
  const command = telegramParser.parseMessage(text);
  const result = await telegramHandlers.executeCommand(userId, command, text);

  return replyAndAck(botToken, chatId, result.text, result.resultCode, result.replyMarkup);
}

/** Boilerplate repetido em quase todo passo: reply → log `resultCode`/motivo → ack 200. */
async function replyAndAck(
  botToken: string,
  chatId: number | string,
  text: string,
  logSuffix: string,
  replyMarkup?: TelegramReplyMarkup,
): Promise<NextResponse> {
  await telegramApi.sendMessage(botToken, chatId, text, { replyMarkup });
  console.log(`chat_id=${chatId} -> ${logSuffix}`);
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
