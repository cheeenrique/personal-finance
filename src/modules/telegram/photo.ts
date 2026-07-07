import type { TelegramPhotoInput, TelegramPhotoSize } from "./types";

/**
 * Detecta e extrai a foto de maior resolução de uma mensagem do Telegram
 * (docs/30-TELEGRAM.md — parse de imagem via Gemini vision). `message.photo`
 * é um array de `PhotoSize` do menor pro maior (thumb→full) — usamos a MAIOR
 * `width` pra dar ao Gemini a melhor qualidade possível de leitura da
 * nota/comprovante/notificação.
 *
 * Função PURA, sem I/O — o roteamento (`route.ts`) chama isto pra decidir se
 * a mensagem segue pro caminho de imagem (`telegramHandlers.handleImageEntry`)
 * ou pro caminho de texto de sempre. `null` quando a mensagem não tem foto
 * (`message.photo` ausente/vazio).
 */
export function extractLargestPhoto(message: {
  photo?: TelegramPhotoSize[];
  caption?: string;
}): TelegramPhotoInput | null {
  if (!message.photo || message.photo.length === 0) return null;

  const largest = message.photo.reduce((max, size) => (size.width > max.width ? size : max));
  const caption = message.caption?.trim();

  return { fileId: largest.file_id, caption: caption ? caption : null };
}
