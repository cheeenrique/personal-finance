import { z } from "zod";
import { positiveDecimalSchema } from "@/lib/money/schema";

const monthSchema = z.coerce.number().int().min(1, "Mês deve estar entre 1 e 12").max(12, "Mês deve estar entre 1 e 12");
const yearSchema = z.coerce.number().int().min(2000, "Ano inválido").max(2100, "Ano inválido");

export const createBudgetSchema = z.object({
  categoryId: z.string().trim().min(1, "Categoria é obrigatória"),
  month: monthSchema,
  year: yearSchema,
  plannedAmount: positiveDecimalSchema,
});

/**
 * Todos os campos editáveis, incluindo `categoryId`/`month`/`year` — mover um
 * orçamento pra outra categoria/período é uma correção legítima (ex.: usuário
 * errou a categoria na criação). O unique (userId, categoryId, month, year) é
 * revalidado no service.ts contra o estado MESCLADO (docs/03-DATABASE.md).
 */
export const updateBudgetSchema = z.object({
  categoryId: z.string().trim().min(1).optional(),
  month: monthSchema.optional(),
  year: yearSchema.optional(),
  plannedAmount: positiveDecimalSchema.optional(),
});

export const listBudgetsWithProgressSchema = z.object({
  year: yearSchema,
  month: monthSchema,
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type ListBudgetsWithProgressInput = z.infer<typeof listBudgetsWithProgressSchema>;
