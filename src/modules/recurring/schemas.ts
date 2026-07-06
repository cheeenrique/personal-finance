import { z } from "zod";
import { RecurringFrequency, TransactionType } from "@/generated/prisma/enums";

/**
 * Tipos aceitos por uma recorrência. Só INCOME/EXPENSE — recorrência sempre
 * usa `accountId` (nunca `cardId`, ver schema do Prisma), então TRANSFER e
 * CARD_PAYMENT não fazem sentido aqui (docs/20-TRANSACTIONS.md, "Recorrência").
 */
const CREATABLE_RECURRING_TYPES = [TransactionType.INCOME, TransactionType.EXPENSE] as const;

const FREQUENCY_VALUES = Object.values(RecurringFrequency) as [RecurringFrequency, ...RecurringFrequency[]];

/**
 * Valor monetário aceito na borda (number ou string), normalizado para string
 * decimal com no máximo 2 casas — nunca float na regra de negócio (ver
 * docs/03-DATABASE.md). Mesmo parser de `modules/accounts/schemas.ts`,
 * `modules/transactions/schemas.ts` e `modules/assets/schemas.ts` — já é a
 * 4ª ocorrência, cruzando o limiar de extração da rule 02-dry-kiss-yagni
 * ("3 ocorrências = extrair pra helper"). Mantido colocado aqui porque o
 * escopo desta task restringe as mudanças a `modules/assets`,
 * `modules/recurring` e ao cron — extração pra `lib/money` fica como
 * sugestão de melhoria separada (ver retorno da task).
 */
const decimalStringSchema = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim())
  .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(value), {
    message: "Valor monetário inválido — use até 2 casas decimais",
  });

/** Igual a `decimalStringSchema`, mas exige positivo — espelha o CHECK `amount > 0` da tabela Transaction. */
const positiveDecimalSchema = decimalStringSchema.refine((value) => Number(value) > 0, {
  message: "Valor deve ser positivo",
});

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
