import { getDocumentProxy, extractText as unpdfExtractText } from "unpdf";

/**
 * Extração de texto de PDF (`unpdf`, build serverless de PDF.js — sem canvas/DOM,
 * sem binário nativo, roda em runtime Node serverless da Vercel; ver decisão de lib
 * no topo deste comentário no plano de origem,
 * docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T1).
 *
 * NUNCA loga bytes do PDF nem a senha (mesmo racional de `lib/ai/gemini.ts`,
 * docs/30-TELEGRAM.md "Segurança").
 */

/** PDF cifrado sem senha informada OU com senha incorreta — pdf.js lança
 * `PasswordException` nos dois casos (código `NEED_PASSWORD`/`INCORRECT_PASSWORD`);
 * o chamador (`card-invoice-parser.ts`, `financing-parser.ts`) decide o fallback
 * (pedir senha de novo pro usuário), nunca deixa a exception genérica vazar. */
export class PdfPasswordError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PdfPasswordError";
  }
}

export type PdfExtraction = { text: string; hasTextLayer: boolean };

/** Texto extraído abaixo deste tamanho é considerado "vazio/lixo" — sinal de PDF
 * ESCANEADO (foto virou PDF sem camada de texto real). Threshold pequeno de
 * propósito: qualquer fatura/extrato real produz muito mais que isso. */
const MIN_MEANINGFUL_TEXT_LENGTH = 20;

function isPasswordError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "PasswordException" || /password/i.test(error.message);
}

export async function extractPdfText(bytes: Buffer, password?: string): Promise<PdfExtraction> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : undefined);
  } catch (error) {
    if (isPasswordError(error)) {
      throw new PdfPasswordError("PDF protegido por senha — senha incorreta ou não informada.", error);
    }
    throw error;
  }

  const { text } = await unpdfExtractText(pdf, { mergePages: true });
  const trimmed = text.trim();
  return { text: trimmed, hasTextLayer: trimmed.length >= MIN_MEANINGFUL_TEXT_LENGTH };
}
