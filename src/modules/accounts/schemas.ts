import { z } from "zod";
import { AccountType } from "@/generated/prisma/enums";

const ACCOUNT_TYPE_VALUES = Object.values(AccountType) as [AccountType, ...AccountType[]];

/**
 * Valor monetário aceito na borda (number ou string), normalizado para string
 * decimal com no máximo 2 casas — nunca float na regra de negócio (ver
 * docs/03-DATABASE.md). Colocado aqui, não em `lib/money`, até um 2º módulo
 * precisar do mesmo parser (YAGNI — ver sugestão de melhoria no retorno).
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

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
