import { z } from "zod";
import { positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";
import { InterestPeriod } from "@/generated/prisma/enums";

const INTEREST_PERIOD_VALUES = [InterestPeriod.ANNUAL, InterestPeriod.MONTHLY] as const;

/**
 * Ver docs/03-DATABASE.md (model Loan) — cria 1 Loan + N Transactions
 * (parcelas), análogo a `createInstallmentPurchaseSchema` de
 * `modules/transactions/schemas.ts`, mas na CONTA (não cartão) e com
 * principal + juros.
 *
 * `installmentsCount` aceita a partir de 1 (diferente do mínimo 2 de
 * parcelamento de cartão — docs/23-INSTALLMENTS.md: uma compra "parcelada"
 * em 1x não faz sentido como parcelamento, mas um empréstimo quitado numa
 * parcela só é um caso real, ex. empréstimo de curto prazo). Teto de 360
 * (30 anos mensais) é só uma guarda defensiva contra entrada absurda, sem
 * requisito de produto por trás — YAGNI além disso.
 */
export const createLoanSchema = z
  .object({
    description: z.string().trim().min(1, "Descrição é obrigatória").max(255),
    lender: z.string().trim().max(120).optional(),
    principal: positiveDecimalSchema,
    totalToPay: positiveDecimalSchema,
    installmentsCount: z.coerce
      .number()
      .int()
      .min(1, "Mínimo de 1 parcela")
      .max(360, "Máximo de 360 parcelas"),
    installmentAmount: positiveDecimalSchema,
    firstDueDate: dateInputSchema,
    accountId: z.string().trim().min(1, "Conta é obrigatória"),
    categoryId: z.string().trim().min(1).optional(),
  })
  .refine((data) => Number(data.totalToPay) >= Number(data.principal), {
    message: "Total a pagar não pode ser menor que o principal",
    path: ["totalToPay"],
  });

export type CreateLoanInput = z.infer<typeof createLoanSchema>;

/**
 * Update é parcial — cada campo só sobrescreve se vier no payload (mesmo
 * padrão de `modules/transactions/schemas.ts` `updateTransactionSchema`).
 * Invariantes que dependem do estado MESCLADO (ex.: `totalToPay >=
 * principal`, `interestRate`+`interestPeriod` juntos, `installmentsCount`
 * não pode ficar abaixo do nº de parcelas já pagas) são reavaliadas em
 * `service.ts` `updateLoan` contra existente+patch, não aqui — o schema só
 * valida o formato de CADA campo isolado (mesmo motivo do comentário em
 * `updateTransactionSchema`).
 *
 * `interestRate`/`interestPeriod` aceitam `null` explícito pra DESLIGAR
 * juros (voltar ao default do produto) — `undefined` (campo omitido) nunca
 * mexe no valor atual.
 */
export const updateLoanSchema = z.object({
  description: z.string().trim().min(1, "Descrição é obrigatória").max(255).optional(),
  lender: z.string().trim().max(120).nullable().optional(),
  principal: positiveDecimalSchema.optional(),
  totalToPay: positiveDecimalSchema.optional(),
  installmentsCount: z.coerce.number().int().min(1, "Mínimo de 1 parcela").max(360, "Máximo de 360 parcelas").optional(),
  installmentAmount: positiveDecimalSchema.optional(),
  firstDueDate: dateInputSchema.optional(),
  accountId: z.string().trim().min(1, "Conta é obrigatória").optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  interestRate: positiveDecimalSchema.nullable().optional(),
  interestPeriod: z.enum(INTEREST_PERIOD_VALUES).nullable().optional(),
});

export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;

/** Sugestão de antecipação de UMA parcela (docs da tarefa, "Antecipação") — `paymentDate` é a data em que o usuário está (ou pretende) pagar, insumo de `interest.ts` `monthsEarly`. */
export const suggestEarlyPaymentSchema = z.object({
  installmentId: z.string().trim().min(1, "Parcela é obrigatória"),
  paymentDate: dateInputSchema,
});

export type SuggestEarlyPaymentInput = z.infer<typeof suggestEarlyPaymentSchema>;

/**
 * Quitação total do empréstimo. `totalPaid` é OPCIONAL — quando ausente, o
 * service calcula o total sugerido (Σ valor presente das parcelas não
 * pagas); quando informado, é o valor que o usuário editou/confirmou (mesma
 * filosofia de `suggested` em `earlyPaymentSuggestion`: sugestão é só ponto
 * de partida).
 */
export const settleLoanSchema = z.object({
  settleDate: dateInputSchema,
  totalPaid: positiveDecimalSchema.optional(),
});

export type SettleLoanInput = z.infer<typeof settleLoanSchema>;
