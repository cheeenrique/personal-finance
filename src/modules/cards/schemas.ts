import { z } from "zod";
import { parseInSaoPaulo } from "@/lib/date/timezone";

/**
 * Valor monetário aceito na borda (number ou string), normalizado para string
 * decimal com no máximo 2 casas — nunca float na regra de negócio (ver
 * docs/03-DATABASE.md). Mesmo parser de `modules/accounts/schemas.ts` e
 * `modules/transactions/schemas.ts` — 3ª ocorrência; extrair para
 * `lib/money` é sugestão de melhoria separada (ver retorno da task), não
 * feita aqui porque o escopo desta tarefa é só `src/modules/cards/`.
 */
const decimalStringSchema = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim())
  .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(value), {
    message: "Valor monetário inválido — use até 2 casas decimais",
  });

/** Igual a `decimalStringSchema`, mas exige positivo (limite do cartão e valor de pagamento nunca são <= 0). */
const positiveDecimalSchema = decimalStringSchema.refine((value) => Number(value) > 0, {
  message: "Valor deve ser positivo",
});

/**
 * Mesma lógica de `modules/transactions/schemas.ts` `parseFlexibleDate`:
 * string `YYYY-MM-DD` (sem hora) é tratada como meia-noite em
 * America/Sao_Paulo, não UTC — evita deslocar a data percebida pelo usuário.
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

const dayOfMonthSchema = z.coerce
  .number()
  .int()
  .min(1, "Dia deve ser entre 1 e 31")
  .max(31, "Dia deve ser entre 1 e 31");

export const createCardSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  brand: z.string().trim().min(1, "Bandeira é obrigatória").max(60),
  limit: positiveDecimalSchema,
  closingDay: dayOfMonthSchema,
  dueDay: dayOfMonthSchema,
  color: z.string().trim().max(30).optional(),
  icon: z.string().trim().max(60).optional(),
});

export const updateCardSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(60).optional(),
  limit: positiveDecimalSchema.optional(),
  closingDay: dayOfMonthSchema.optional(),
  dueDay: dayOfMonthSchema.optional(),
  color: z.string().trim().max(30).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Pagamento de fatura (docs/22-CREDIT_CARDS.md, "Pagamento da fatura"):
 * exige cardId (fatura abatida) E accountId (conta pagadora) — diferente da
 * transação genérica, que exige XOR conta/cartão.
 */
export const payInvoiceSchema = z.object({
  cardId: z.string().trim().min(1, "Cartão é obrigatório"),
  accountId: z.string().trim().min(1, "Conta é obrigatória"),
  amount: positiveDecimalSchema,
  date: dateInputSchema,
  description: z.string().trim().max(255).optional(),
});

export const currentInvoiceQuerySchema = z.object({
  cardId: z.string().trim().min(1, "Cartão é obrigatório"),
  refDate: dateInputSchema.optional(),
});

export const invoiceForQuerySchema = z.object({
  cardId: z.string().trim().min(1, "Cartão é obrigatório"),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;
export type CurrentInvoiceQueryInput = z.infer<typeof currentInvoiceQuerySchema>;
export type InvoiceForQueryInput = z.infer<typeof invoiceForQuerySchema>;
