"use server";

import { auth } from "@/lib/auth";
import { parseFinancingFromDocument } from "@/modules/telegram/financing-parser";
import type { ParsedFinancing } from "@/modules/telegram/types";

/**
 * Adaptador de fronteira client/server pro import de documento de
 * financiamento (CCB/contrato de banco, PDF ou foto) — vive em
 * `app/(app)/financings/` (não em `modules/`) por instrução explícita da
 * tarefa: "só CONSUMIR as actions/serviços" já existentes, sem tocar em
 * `src/modules/*`. Espelha `handleDocumentEntry`
 * (`modules/telegram/handlers.ts`), mas NUNCA cria nada — só extrai e devolve
 * `ParsedFinancing` pra `FinancingFormModal` pré-preencher; o usuário revisa
 * e confirma antes de `createFinancingAction` gravar (docs da tarefa, item 5).
 * A extração em si (Gemini) é 100% `modules/telegram/financing-parser.ts`,
 * reusada como está — sem lógica de domínio nova aqui, só validação de
 * mimeType + serialização de erro (mesmo racional de
 * `components/shared/entity-options-actions.ts`, "Adaptador de fronteira").
 */

type ActionError = { code: string; message: string };
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Mesmo allow-list de `SUPPORTED_FINANCING_DOCUMENT_MIME_TYPES` (`modules/telegram/handlers.ts`) — const privada de lá, duplicada aqui (2ª ocorrência, rule 02-dry-kiss-yagni) por não poder importar de um arquivo interno do módulo telegram sem tocá-lo. */
const SUPPORTED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function parseFinancingDocumentAction(
  base64: string,
  mimeType: string,
): Promise<ActionResult<ParsedFinancing>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Sessão inválida." } };
  }

  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    return {
      success: false,
      error: { code: "UNSUPPORTED_MIME_TYPE", message: "Formato não suportado — envie PDF, JPEG, PNG ou WebP." },
    };
  }

  const documentBytes = Buffer.from(base64, "base64");
  const parsed = await parseFinancingFromDocument(documentBytes, mimeType);

  if (!parsed) {
    return {
      success: false,
      error: {
        code: "DOCUMENT_UNREADABLE",
        message: "Não consegui ler o documento — preencha os campos manualmente.",
      },
    };
  }

  return { success: true, data: parsed };
}
