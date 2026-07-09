import type { TelegramVoiceInput } from "./types";

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
