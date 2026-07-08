"use server";

import { auth } from "@/lib/auth";
import { searchService } from "./service";
import { SearchDomainError } from "./errors";
import type { ActionResult, SearchResultItem } from "./types";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). Busca é só-leitura — sem revalidatePath. */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = {
  code: "UNAUTHENTICATED",
  message: "Sessão inválida.",
} as const;

function toActionError(error: unknown): {
  success: false;
  error: { code: string; message: string };
} {
  if (error instanceof SearchDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/search] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a busca." },
  };
}

/** Busca global do Command Palette (`Ctrl+K`, docs/06-SCREENS.md) — transações/contas/cartões/categorias/tags do usuário logado. */
export async function searchEntitiesAction(
  query: string,
): Promise<ActionResult<SearchResultItem[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const results = await searchService.searchEntities(userId, query);
    return { success: true, data: results };
  } catch (error) {
    return toActionError(error);
  }
}
