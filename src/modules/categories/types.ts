import type { Category } from "@/generated/prisma/client";
import type { CategoryType } from "@/generated/prisma/enums";

export type { Category, CategoryType };

/** Categoria + filhas aninhadas (recursivo) — retorno de `listTree` (ver service.ts). */
export type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
