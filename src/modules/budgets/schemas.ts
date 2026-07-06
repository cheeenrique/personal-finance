import { z } from "zod";

/**
 * Valor monetário aceito na borda (number ou string), normalizado para string
 * decimal com no máximo 2 casas — nunca float na regra de negócio (ver
 * docs/03-DATABASE.md). Mesmo parser de `modules/accounts/schemas.ts` e
 * `modules/transactions/schemas.ts` — 3ª ocorrência, já candidata a extração
 * pra `lib/money` (ver rule 02-dry-kiss-yagni, "3 ocorrências = extrair"),
 * mas fica local por instrução explícita da task (extração é do orquestrador).
 */
const decimalStringSchema = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim())
  .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(value), {
    message: "Valor monetário inválido — use até 2 casas decimais",
  });

/** Igual a `decimalStringSchema`, mas exige positivo — `plannedAmount` do Budget é sempre > 0 (docs/26-BUDGETS.md). */
const positiveDecimalSchema = decimalStringSchema.refine((value) => Number(value) > 0, {
  message: "Valor deve ser positivo",
});

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
