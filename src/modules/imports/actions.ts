"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { importService } from "./service";
import { commitImportSchema, importSchema } from "./schemas";
import { ImportDomainError } from "./errors";
import type { ActionResult, ImportCommitResult, ImportParseError, ImportPreviewResult, ImportTarget, ParsedTransaction } from "./types";

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
  return { success: false, error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." } };
}

/** Invalida as rotas certas por target — cartão nunca revalida `/accounts` e vice-versa. */
function revalidateForTarget(target: ImportTarget): void {
  if (target.kind === "account") {
    revalidatePath("/accounts");
    revalidatePath(`/accounts/${target.accountId}`);
  } else {
    revalidatePath("/cards");
    revalidatePath(`/cards/${target.cardId}`);
  }
  revalidatePath("/dashboard");
}

/** Só leitura — parseia e classifica, nada é gravado. Sem `revalidatePath`. */
export async function previewImportAction(
  target: ImportTarget,
  fileName: string,
  fileContent: string,
  password?: string,
): Promise<ActionResult<ImportPreviewResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = importSchema.safeParse({ target, fileName, fileContent, password });
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." } };
  }

  try {
    const result = await importService.previewImport(
      userId,
      parsed.data.target,
      parsed.data.fileName,
      parsed.data.fileContent,
      parsed.data.password,
    );
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function commitImportAction(
  target: ImportTarget,
  transactions: ParsedTransaction[],
  errors: ImportParseError[],
): Promise<ActionResult<ImportCommitResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = commitImportSchema.safeParse({ target, transactions, errors });
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." } };
  }

  try {
    const result = await importService.commitImport(userId, parsed.data.target, parsed.data.transactions, parsed.data.errors);
    revalidateForTarget(parsed.data.target);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}
