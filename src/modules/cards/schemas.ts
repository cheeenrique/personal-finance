import { z } from "zod";
import { CardType, CardStatus } from "@/generated/prisma/enums";
import { positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";

const CARD_TYPE_VALUES = Object.values(CardType) as [CardType, ...CardType[]];
const CARD_STATUS_VALUES = Object.values(CardStatus) as [CardStatus, ...CardStatus[]];

const dayOfMonthSchema = z.coerce
  .number()
  .int()
  .min(1, "Dia deve ser entre 1 e 31")
  .max(31, "Dia deve ser entre 1 e 31");

/** Placeholders ignorados pelo domínio para cartão MEAL (docs/22-CREDIT_CARDS.md não se aplica) — ver `prisma/schema.prisma` `Card.type`. */
const MEAL_PLACEHOLDER_LIMIT = "0";
const MEAL_PLACEHOLDER_DAY = 1;

/**
 * 4 últimos dígitos do cartão — só exibição (`prisma/schema.prisma`
 * `Card.lastFour`), NUNCA o número completo. Filtra tudo que não for dígito
 * antes de validar (aceita "1234" ou "**** 1234" colado do usuário); depois
 * de filtrar, string vazia vira `null` (limpa o campo), qualquer contagem de
 * dígito diferente de 4 é rejeitada.
 */
const lastFourSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return value;
    const digits = value.replace(/\D/g, "");
    return digits === "" ? null : digits;
  })
  .refine((value) => value == null || /^\d{4}$/.test(value), {
    message: "Últimos 4 dígitos devem ter exatamente 4 números",
  });

/** Nome impresso no cartão — opcional, mesmo limite de caractere de um cartão físico real. */
const holderNameSchema = z
  .string()
  .trim()
  .max(26, "Nome impresso deve ter no máximo 26 caracteres")
  .nullable()
  .optional();

/**
 * Validade impressa no cartão, formato "MM/AA" (`prisma/schema.prisma`
 * `Card.expiry`) — só exibição, sem cálculo de vencimento real. Mesmo
 * tratamento de `lastFourSchema`: string vazia (campo limpo pelo usuário)
 * vira `null`.
 */
const expirySchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return value;
    return value === "" ? null : value;
  })
  .refine((value) => value == null || /^(0[1-9]|1[0-2])\/\d{2}$/.test(value), {
    message: "Validade deve estar no formato MM/AA",
  });

/**
 * `type` decide se `limit`/`closingDay`/`dueDay` são exigidos:
 * - CREDIT (default): os 3 campos são obrigatórios (comportamento atual, zero regressão).
 * - MEAL: os 3 campos são opcionais — cartão pré-pago não tem fatura/ciclo/limite de
 *   crédito (docs/22-CREDIT_CARDS.md). Preenchidos com placeholder ignorado pelo
 *   domínio (`service.ts` guarda todo cálculo de fatura/limite atrás de
 *   `card.type === CardType.CREDIT`) — menos disruptivo que tornar as colunas
 *   do banco nullable só para um dos dois tipos de cartão.
 */
export const createCardSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").max(120),
    brand: z.string().trim().min(1, "Bandeira é obrigatória").max(60),
    type: z.enum(CARD_TYPE_VALUES).default(CardType.CREDIT),
    limit: positiveDecimalSchema.optional(),
    closingDay: dayOfMonthSchema.optional(),
    dueDay: dayOfMonthSchema.optional(),
    color: z.string().trim().max(30).optional(),
    icon: z.string().trim().max(60).optional(),
    lastFour: lastFourSchema,
    holderName: holderNameSchema,
    expiry: expirySchema,
  })
  .refine((data) => data.type !== CardType.CREDIT || data.limit !== undefined, {
    message: "Limite é obrigatório para cartão de crédito",
    path: ["limit"],
  })
  .refine((data) => data.type !== CardType.CREDIT || data.closingDay !== undefined, {
    message: "Dia de fechamento é obrigatório para cartão de crédito",
    path: ["closingDay"],
  })
  .refine((data) => data.type !== CardType.CREDIT || data.dueDay !== undefined, {
    message: "Dia de vencimento é obrigatório para cartão de crédito",
    path: ["dueDay"],
  })
  .transform((data) => ({
    ...data,
    limit: data.limit ?? MEAL_PLACEHOLDER_LIMIT,
    closingDay: data.closingDay ?? MEAL_PLACEHOLDER_DAY,
    dueDay: data.dueDay ?? MEAL_PLACEHOLDER_DAY,
  }));

export const updateCardSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(60).optional(),
  limit: positiveDecimalSchema.optional(),
  closingDay: dayOfMonthSchema.optional(),
  dueDay: dayOfMonthSchema.optional(),
  color: z.string().trim().max(30).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  lastFour: lastFourSchema,
  holderName: holderNameSchema,
  expiry: expirySchema,
  isActive: z.boolean().optional(),
  /** Sincroniza `isActive` no repository (ACTIVE → true, BLOCKED/CANCELLED → false — ver `prisma/schema.prisma` `Card.status`). Cartão novo nasce ACTIVE via default do banco, por isso não entra em `createCardSchema`. */
  status: z.enum(CARD_STATUS_VALUES).optional(),
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

/** Input de `setCardStatusAction` (actions.ts) — valida o `status` recebido do client antes de chegar no service, mesmo tratamento de qualquer outro input de Server Action (boundary validation). */
export const setCardStatusSchema = z.object({
  status: z.enum(CARD_STATUS_VALUES),
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
export type SetCardStatusInput = z.infer<typeof setCardStatusSchema>;
