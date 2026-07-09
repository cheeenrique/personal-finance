import { z } from "zod";
import { decimalStringSchema, positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";

/** % do CDI — ex.: "115" ou "115.00" (até 2 casas). */
export const percentOfBenchmarkSchema = decimalStringSchema.refine(
  (value) => Number(value) > 0 && Number(value) <= 9999.99,
  { message: "% do CDI inválido" },
);

/**
 * Cria o produto de investimento (Asset INVESTMENT) + aporte inicial opcional
 * na mesma action (docs/28-INVESTMENTS.md).
 */
export const createInvestmentSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").max(120),
    yieldPercentOfBenchmark: percentOfBenchmarkSchema,
    notes: z.string().trim().max(1000).optional(),
    /** Aporte inicial — se informado, exige conta + valor. */
    initialContribution: z
      .object({
        accountId: z.string().trim().min(1, "Conta é obrigatória"),
        amount: positiveDecimalSchema,
        categoryId: z.string().trim().min(1, "Categoria é obrigatória"),
        date: dateInputSchema.default(() => new Date()),
        yieldPercentOfBenchmark: percentOfBenchmarkSchema.optional(),
      })
      .optional(),
  });

export const contributeToInvestmentSchema = z.object({
  accountId: z.string().trim().min(1, "Conta é obrigatória"),
  amount: positiveDecimalSchema,
  categoryId: z.string().trim().min(1, "Categoria é obrigatória"),
  date: dateInputSchema.default(() => new Date()),
  yieldPercentOfBenchmark: percentOfBenchmarkSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateInvestmentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  yieldPercentOfBenchmark: percentOfBenchmarkSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const projectYieldSchema = z.object({
  principal: positiveDecimalSchema,
  yieldPercentOfBenchmark: percentOfBenchmarkSchema,
  cdiAnnualRatePercent: decimalStringSchema.refine((value) => Number(value) >= 0, {
    message: "CDI inválido",
  }),
  days: z.coerce.number().int().min(1).max(3650),
});

export const upsertCdiManualSchema = z.object({
  annualRatePercent: decimalStringSchema.refine(
    (value) => Number(value) >= 0 && Number(value) <= 100,
    { message: "Taxa CDI inválida" },
  ),
  date: dateInputSchema.default(() => new Date()),
});

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
export type ContributeToInvestmentInput = z.infer<typeof contributeToInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;
export type ProjectYieldInput = z.infer<typeof projectYieldSchema>;
export type UpsertCdiManualInput = z.infer<typeof upsertCdiManualSchema>;
