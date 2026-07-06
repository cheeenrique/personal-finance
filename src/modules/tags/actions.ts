"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { tagService } from "./service";
import { createTagSchema, updateTagSchema } from "./schemas";
import { TagDomainError } from "./errors";
import type { Tag, ActionResult } from "./types";

const TAGS_PATH = "/tags";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof TagDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/tags] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

export async function createTagAction(input: unknown): Promise<ActionResult<Tag>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createTagSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const tag = await tagService.createTag(userId, parsed.data);
    revalidatePath(TAGS_PATH);
    return { success: true, data: tag };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateTagAction(id: string, input: unknown): Promise<ActionResult<Tag>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateTagSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const tag = await tagService.updateTag(userId, id, parsed.data);
    revalidatePath(TAGS_PATH);
    return { success: true, data: tag };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteTagAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await tagService.deleteTag(userId, id);
    revalidatePath(TAGS_PATH);
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listTagsAction(): Promise<ActionResult<Tag[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const tags = await tagService.listTags(userId);
    return { success: true, data: tags };
  } catch (error) {
    return toActionError(error);
  }
}
