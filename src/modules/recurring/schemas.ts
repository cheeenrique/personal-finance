import { z } from "zod";
import { RecurringFrequency, TransactionType } from "@/generated/prisma/enums";
import { positiveDecimalSchema } from "@/lib/money/schema";

/**
 * Tipos aceitos por uma recorrência. Só INCOME/EXPENSE — recorrência sempre
 * usa `accountId` (nunca `cardId`, ver schema do Prisma), então TRANSFER e
 * CARD_PAYMENT não fazem sentido aqui (docs/20-TRANSACTIONS.md, "Recorrência").
 */
const CREATABLE_RECURRING_TYPES = [TransactionType.INCOME, TransactionType.EXPENSE] as const;

const FREQUENCY_VALUES = Object.values(RecurringFrequency) as [RecurringFrequency, ...RecurringFrequency[]];

export const createRecurringTransactionSchema = z
  .object({
    description: z.string().trim().min(1, "Descrição é obrigatória").max(255),
    amount: positiveDecimalSchema,
    type: z.enum(CREATABLE_RECURRING_TYPES),
    categoryId: z.string().trim().min(1, "Categoria é obrigatória"),
    accountId: z.string().trim().min(1, "Conta é obrigatória"),
    frequency: z.enum(FREQUENCY_VALUES),
    dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    active: z.boolean().default(true),
  })
  .refine((data) => data.frequency !== RecurringFrequency.MONTHLY || data.dayOfMonth !== undefined, {
    message: "dayOfMonth é obrigatório para frequência MONTHLY",
    path: ["dayOfMonth"],
  })
  .refine((data) => data.frequency !== RecurringFrequency.WEEKLY || data.dayOfWeek !== undefined, {
    message: "dayOfWeek é obrigatório para frequência WEEKLY",
    path: ["dayOfWeek"],
  });

/**
 * Update é parcial — a invariante de agendamento (MONTHLY exige dayOfMonth,
 * WEEKLY exige dayOfWeek) é reavaliada no service.ts contra o estado
 * MESCLADO (existente + patch), não só contra o payload isolado (mesmo
 * padrão de `modules/transactions/schemas.ts` `updateTransactionSchema`).
 * `nextRun` nunca é campo de entrada — é sempre computado (ver
 * `next-run.ts`), nunca setado diretamente pelo usuário.
 */
export const updateRecurringTransactionSchema = z.object({
  description: z.string().trim().min(1).max(255).optional(),
  amount: positiveDecimalSchema.optional(),
  type: z.enum(CREATABLE_RECURRING_TYPES).optional(),
  categoryId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  frequency: z.enum(FREQUENCY_VALUES).optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).nullable().optional(),
  active: z.boolean().optional(),
});

export type CreateRecurringTransactionInput = z.infer<typeof createRecurringTransactionSchema>;
export type UpdateRecurringTransactionInput = z.infer<typeof updateRecurringTransactionSchema>;
