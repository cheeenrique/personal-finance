"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { categoryService } from "./service";
import { createCategorySchema, updateCategorySchema } from "./schemas";
import { CategoryDomainError } from "./errors";
import type { Category, CategoryTreeNode, ActionResult } from "./types";

const CATEGORIES_PATH = "/categories";
const DASHBOARD_PATH = "/dashboard";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof CategoryDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/categories] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateCategoryRoutes(): void {
  revalidatePath(CATEGORIES_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<Category>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const category = await categoryService.createCategory(userId, parsed.data);
    revalidateCategoryRoutes();
    return { success: true, data: category };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCategoryAction(id: string, input: unknown): Promise<ActionResult<Category>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const category = await categoryService.updateCategory(userId, id, parsed.data);
    revalidateCategoryRoutes();
    return { success: true, data: category };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await categoryService.deleteCategory(userId, id);
    revalidateCategoryRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listCategoryTreeAction(): Promise<ActionResult<CategoryTreeNode[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const tree = await categoryService.listTree(userId);
    return { success: true, data: tree };
  } catch (error) {
    return toActionError(error);
  }
}
