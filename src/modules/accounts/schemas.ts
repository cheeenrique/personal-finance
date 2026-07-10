import { z } from "zod";
import { AccountType } from "@/generated/prisma/enums";
import { decimalStringSchema, positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";

const ACCOUNT_TYPE_VALUES = Object.values(AccountType) as [AccountType, ...AccountType[]];

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  type: z.enum(ACCOUNT_TYPE_VALUES),
  initialBalance: decimalStringSchema,
  color: z.string().trim().max(30).optional(),
  icon: z.string().trim().max(60).optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(ACCOUNT_TYPE_VALUES).optional(),
  initialBalance: decimalStringSchema.optional(),
  color: z.string().trim().max(30).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const transferSchema = z
  .object({
    fromAccountId: z.string().min(1, "Conta de origem é obrigatória"),
    toAccountId: z.string().min(1, "Conta de destino é obrigatória"),
    amount: positiveDecimalSchema,
    date: z.coerce.date(),
    description: z.string().trim().min(1, "Descrição é obrigatória").max(255),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: "Conta de origem e destino devem ser diferentes",
    path: ["toAccountId"],
  });

/** Input de `accountPeriodSummaryAction` — mesmo `dateInputSchema` do filtro de período de `/transactions` (`YYYY-MM-DD` ou `Date`). */
export const accountPeriodSummarySchema = z.object({
  accountId: z.string().min(1, "Conta é obrigatória"),
  dateFrom: dateInputSchema.optional(),
  dateTo: dateInputSchema.optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type AccountPeriodSummaryInput = z.infer<typeof accountPeriodSummarySchema>;
