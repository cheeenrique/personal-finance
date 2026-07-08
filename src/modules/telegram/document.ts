import type { TelegramDocumentInput } from "./types";

/** Extensões suportadas pra ingestão de financiamento (docs/30-TELEGRAM.md — contrato/CCB em PDF ou foto), usadas só como fallback quando o Telegram não manda `mime_type`. */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function inferMimeTypeFromFileName(fileName: string | undefined): string | null {
  if (!fileName) return null;

  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) return null;

  return EXTENSION_MIME_TYPES[extension] ?? null;
}

/**
 * Detecta e normaliza o `message.document` de um update do Telegram
 * (docs/30-TELEGRAM.md — ingestão de DOCUMENTO de financiamento via Gemini,
 * `financing-parser.ts`). `mime_type` é OPCIONAL na Bot API pra documentos
 * (diferente de `message.photo`, sempre JPEG recomprimido) — quando ausente,
 * cai pro fallback por extensão do `file_name` (`inferMimeTypeFromFileName`).
 *
 * Função PURA, sem I/O — mesmo racional de `extractLargestPhoto` (`photo.ts`):
 * o roteamento (`route.ts`) chama isto pra decidir se a mensagem segue pro
 * caminho de documento (`telegramHandlers.handleDocumentEntry`) ou pro
 * caminho de texto/foto de sempre. `null` quando a mensagem não tem documento,
 * ou quando nenhum mimeType dá pra resolver (extensão desconhecida sem
 * `mime_type`) — `handleDocumentEntry` nunca roda sem mimeType.
 */
export function extractDocument(message: {
  document?: { file_id: string; file_name?: string; mime_type?: string };
}): TelegramDocumentInput | null {
  if (!message.document) return null;

  const mimeType = message.document.mime_type ?? inferMimeTypeFromFileName(message.document.file_name);
  if (!mimeType) return null;

  return { fileId: message.document.file_id, mimeType };
}
