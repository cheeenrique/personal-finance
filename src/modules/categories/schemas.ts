import { z } from "zod";
import { CategoryType } from "@/generated/prisma/enums";

const CATEGORY_TYPE_VALUES = Object.values(CategoryType) as [CategoryType, ...CategoryType[]];

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  type: z.enum(CATEGORY_TYPE_VALUES),
  icon: z.string().trim().max(60).optional(),
  color: z.string().trim().max(30).optional(),
  parentId: z.string().trim().min(1).optional(),
});

/**
 * `type` não é editável após a criação — trocar o tipo de uma categoria já
 * existente quebraria a invariante "filha herda type do pai" pra toda a
 * subárvore (docs/24-CATEGORIES.md, "Regra de Tipo"). Recriar a categoria é o
 * caminho caso o usuário precise mudar de INCOME/EXPENSE.
 */
export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  color: z.string().trim().max(30).nullable().optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
