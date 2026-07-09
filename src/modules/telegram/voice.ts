import type { TelegramVoiceInput } from "./types";

/** Extensões de áudio — fallback quando `document` vem sem `mime_type`. */
const AUDIO_EXTENSIONS = new Set(["ogg", "opus", "oga", "mp3", "m4a", "wav", "aac", "flac"]);

function mimeFromAudioFileName(fileName: string | undefined): string | null {
  if (!fileName) return null;
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !AUDIO_EXTENSIONS.has(extension)) return null;
  if (extension === "ogg" || extension === "opus" || extension === "oga") return "audio/ogg";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "wav") return "audio/wav";
  if (extension === "aac") return "audio/aac";
  if (extension === "flac") return "audio/flac";
  return null;
}

function isAudioMime(mimeType: string | undefined): boolean {
  return Boolean(mimeType?.trim().toLowerCase().startsWith("audio/"));
}

/**
 * Detecta `message.voice` (nota de voz do Telegram — OGG Opus).
 * Função PURA — `route.ts` decide o caminho. `null` sem voice.
 */
export function extractVoice(message: {
  voice?: { file_id: string; duration?: number; mime_type?: string };
}): TelegramVoiceInput | null {
  if (!message.voice?.file_id) return null;

  return {
    fileId: message.voice.file_id,
    durationSeconds: typeof message.voice.duration === "number" ? message.voice.duration : null,
    mimeType: message.voice.mime_type?.trim() || "audio/ogg",
  };
}

/**
 * Detecta `message.audio` (arquivo de áudio / "música" na Bot API).
 * No app parece player de áudio, NÃO nota de voz — sem isto o webhook
 * respondia 200 e o usuário ficava mudo (docs/30-TELEGRAM.md).
 */
export function extractAudio(message: {
  audio?: { file_id: string; duration?: number; mime_type?: string; file_name?: string };
}): TelegramVoiceInput | null {
  if (!message.audio?.file_id) return null;

  const mimeType =
    message.audio.mime_type?.trim() ||
    mimeFromAudioFileName(message.audio.file_name) ||
    "audio/ogg";

  return {
    fileId: message.audio.file_id,
    durationSeconds: typeof message.audio.duration === "number" ? message.audio.duration : null,
    mimeType,
  };
}

/**
 * Detecta `message.document` que é áudio (mime `audio/*` ou extensão .ogg/.mp3…).
 * Forward / "enviar como arquivo" cai aqui — sem isto `extractDocument` devolve
 * `null` (extensão .ogg fora da lista de PDF/foto) e o bot fica mudo.
 */
export function extractAudioDocument(message: {
  document?: { file_id: string; file_name?: string; mime_type?: string };
}): TelegramVoiceInput | null {
  if (!message.document?.file_id) return null;

  const mimeType = message.document.mime_type?.trim() || mimeFromAudioFileName(message.document.file_name);
  if (!mimeType || !isAudioMime(mimeType)) return null;

  return {
    fileId: message.document.file_id,
    durationSeconds: null,
    mimeType,
  };
}

/**
 * Nota de voz OU arquivo de áudio (`voice` / `audio` / `document` áudio).
 * Ordem: voice nativo primeiro; depois audio; depois document áudio.
 */
export function extractVoiceLike(message: {
  voice?: { file_id: string; duration?: number; mime_type?: string };
  audio?: { file_id: string; duration?: number; mime_type?: string; file_name?: string };
  document?: { file_id: string; file_name?: string; mime_type?: string };
}): TelegramVoiceInput | null {
  return extractVoice(message) ?? extractAudio(message) ?? extractAudioDocument(message);
}

/**
 * Detecta `message.video_note` (vídeo circular / "round video").
 * O bot **não processa** vídeo — `route.ts` só usa isto pra responder
 * `buildVideoRejectedReply` em vez de ficar mudo (docs/30-TELEGRAM.md).
 */
export function extractVideoNote(message: {
  video_note?: { file_id: string; duration?: number };
}): { fileId: string } | null {
  if (!message.video_note?.file_id) return null;
  return { fileId: message.video_note.file_id };
}
