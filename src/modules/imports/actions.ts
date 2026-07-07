"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { importService } from "./service";
import { ofxImportSchema } from "./schemas";
import { ImportDomainError } from "./errors";
import type { ActionResult, OfxImportCommitResult, OfxImportPreview } from "./types";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof ImportDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/imports] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

/** Só leitura — parseia e classifica, nada é gravado. Sem `revalidatePath`. */
export async function previewOfxImportAction(
  accountId: string,
  fileContent: string,
): Promise<ActionResult<OfxImportPreview>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = ofxImportSchema.safeParse({ accountId, fileContent });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const preview = await importService.previewOfxImport(userId, parsed.data.accountId, parsed.data.fileContent);
    return { success: true, data: preview };
  } catch (error) {
    return toActionError(error);
  }
}

export async function commitOfxImportAction(
  accountId: string,
  fileContent: string,
): Promise<ActionResult<OfxImportCommitResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = ofxImportSchema.safeParse({ accountId, fileContent });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await importService.commitOfxImport(userId, parsed.data.accountId, parsed.data.fileContent);
    revalidatePath("/accounts");
    revalidatePath(`/accounts/${parsed.data.accountId}`);
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}
