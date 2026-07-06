import { z } from "zod";
import { positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";

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
