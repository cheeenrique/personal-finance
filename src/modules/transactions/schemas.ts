import { z } from "zod";
import { TransactionType } from "@/generated/prisma/enums";
import { parseInSaoPaulo } from "@/lib/date/timezone";

const ALL_TRANSACTION_TYPE_VALUES = Object.values(TransactionType) as [
  TransactionType,
  ...TransactionType[],
];

/**
 * Tipos criáveis via este módulo. TRANSFER nunca é criada aqui — ela nasce
 * como 2 Transactions (EXPENSE/INCOME com `transferId` compartilhado) via
 * `modules/accounts/transfer.ts` (ver docs/20-TRANSACTIONS.md, "Transferência").
 */
const CREATABLE_TRANSACTION_TYPES = [
  TransactionType.INCOME,
  TransactionType.EXPENSE,
  TransactionType.CARD_PAYMENT,
] as const;

/**
 * Valor monetário aceito na borda (number ou string), normalizado para string
 * decimal com no máximo 2 casas — nunca float na regra de negócio (ver
 * docs/03-DATABASE.md). Mesmo parser de `modules/accounts/schemas.ts` — 2ª
 * ocorrência ainda é aceitável (ver rule 02-dry-kiss-yagni, "2 ocorrências");
 * extrair para `lib/money` é sugestão de melhoria separada (ver retorno da task).
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

/**
 * Interpreta uma data de entrada de duas formas:
 * - `Date` já resolvida → passa direto.
 * - string `YYYY-MM-DD` (sem hora, ex.: date picker) → tratada como meia-noite
 *   em America/Sao_Paulo, não UTC. Sem esse cuidado, `new Date("2026-07-06")`
 *   parseia como 00:00 UTC = 21:00 do dia anterior em SP — deslocaria a data
 *   percebida pelo usuário (ver docs/01-STACK.md, timezone fixo em todo cálculo).
 * - qualquer outra string (ISO com hora/offset) → `new Date(string)`, já
 *   inequívoca.
 */
function parseFlexibleDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return parseInSaoPaulo(new Date(year, month - 1, day, 0, 0, 0, 0));
  }

  return new Date(value);
}

const dateInputSchema = z
  .union([z.string(), z.date()])
  .transform(parseFlexibleDate)
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Data inválida" });

export const createTransactionSchema = z
  .object({
    description: z.string().trim().min(1, "Descrição é obrigatória").max(255),
    amount: positiveDecimalSchema,
    type: z.enum(CREATABLE_TRANSACTION_TYPES),
    categoryId: z.string().trim().min(1).optional(),
    accountId: z.string().trim().min(1).optional(),
    cardId: z.string().trim().min(1).optional(),
    // default = "hoje" (instante atual). `new Date()` já é o instante correto
    // universalmente — sem ginástica de timezone, ver `parseFlexibleDate`
    // para o caso (diferente) de string de data sem hora.
    date: dateInputSchema.default(() => new Date()),
    notes: z.string().trim().max(1000).optional(),
    isPaid: z.boolean().default(true),
    tagIds: z.array(z.string().trim().min(1)).max(20).default([]),
  })
  .refine((data) => Boolean(data.accountId) !== Boolean(data.cardId), {
    message: "Informe exatamente uma origem: conta ou cartão",
    path: ["accountId"],
  })
  .refine((data) => data.type === TransactionType.CARD_PAYMENT || Boolean(data.categoryId), {
    message: "Categoria é obrigatória",
    path: ["categoryId"],
  })
  .refine((data) => data.type !== TransactionType.CARD_PAYMENT || !data.categoryId, {
    message: "Pagamento de fatura não usa categoria",
    path: ["categoryId"],
  });

/**
 * Update é parcial — a invariante "exatamente uma origem" e a regra de
 * categoria por tipo são reavaliadas no service.ts contra o estado MESCLADO
 * (existente + patch), não só contra o payload isolado (ver service.ts
 * `assertSourceAndCategoryInvariant`). Aqui só barra o caso óbvio: os dois
 * campos preenchidos no mesmo payload.
 */
export const updateTransactionSchema = z
  .object({
    description: z.string().trim().min(1).max(255).optional(),
    amount: positiveDecimalSchema.optional(),
    type: z.enum(CREATABLE_TRANSACTION_TYPES).optional(),
    categoryId: z.string().trim().min(1).nullable().optional(),
    accountId: z.string().trim().min(1).nullable().optional(),
    cardId: z.string().trim().min(1).nullable().optional(),
    date: dateInputSchema.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    isPaid: z.boolean().optional(),
    tagIds: z.array(z.string().trim().min(1)).max(20).optional(),
  })
  .refine((data) => !(data.accountId && data.cardId), {
    message: "Informe exatamente uma origem: conta ou cartão",
    path: ["accountId"],
  });

export const listFilterSchema = z.object({
  type: z.enum(ALL_TRANSACTION_TYPE_VALUES).optional(),
  categoryId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  cardId: z.string().trim().min(1).optional(),
  dateFrom: dateInputSchema.optional(),
  dateTo: dateInputSchema.optional(),
  tagId: z.string().trim().min(1).optional(),
  isPaid: z.boolean().optional(),
  amountMin: decimalStringSchema.optional(),
  amountMax: decimalStringSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
});

/** Ver docs/23-INSTALLMENTS.md — cria 1 InstallmentPurchase + N Transactions (parcelas). */
export const createInstallmentPurchaseSchema = z.object({
  cardId: z.string().trim().min(1, "Cartão é obrigatório"),
  description: z.string().trim().min(1, "Descrição é obrigatória").max(255),
  totalAmount: positiveDecimalSchema,
  installmentsCount: z.coerce
    .number()
    .int()
    .min(2, "Mínimo de 2 parcelas")
    .max(60, "Máximo de 60 parcelas"),
  firstDueDate: dateInputSchema,
  categoryId: z.string().trim().min(1, "Categoria é obrigatória"),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListFilterInput = z.infer<typeof listFilterSchema>;
export type CreateInstallmentPurchaseInput = z.infer<typeof createInstallmentPurchaseSchema>;
