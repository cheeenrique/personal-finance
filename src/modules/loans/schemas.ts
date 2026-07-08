import { z } from "zod";
import { positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";
import { InterestPeriod, AmortizationSystem } from "@/generated/prisma/enums";

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

/**
 * Financiamento (`Loan.kind=FINANCING`, ver docs/50-AUDITORIA-BACKLOG.md) —
 * Stage 1 (fundação de dados + geração de parcelas). Campos comuns aos 3
 * sistemas de amortização; cada sistema exige um subconjunto diferente do
 * "contrato" (ver `amortizationSystemFields` abaixo), por isso um
 * `z.discriminatedUnion` em vez de um objeto único com tudo opcional —
 * `installmentAmount`/`totalToPay` fixos fazem sentido pra PRICE, não fazem
 * sentido pra SAC/CUSTOM (ver `modules/loans/installments.ts`
 * `buildFinancingSchedule`, onde cada sistema deriva o que precisa).
 */
const financingCommonFields = {
  description: z.string().trim().min(1, "Descrição é obrigatória").max(255),
  lender: z.string().trim().max(120).optional(),
  accountId: z.string().trim().min(1, "Conta é obrigatória"),
  categoryId: z.string().trim().min(1).optional(),
  principal: positiveDecimalSchema,
  /** `Asset` já cadastrado (ex.: o carro) — opcional, validado por ownership em `installments.ts` `createFinancing`. */
  assetId: z.string().trim().min(1).optional(),
  downPayment: positiveDecimalSchema.optional(),
  assetValue: positiveDecimalSchema.optional(),
  /** CET (% a.m.) — informativo, mesma precisão de schema de `interestRate` (coluna `Decimal(9,6)`, schema restringe a 2 casas por consistência com o resto do módulo). */
  cet: positiveDecimalSchema.optional(),
  operationRef: z.string().trim().max(120).optional(),
  financedTaxes: positiveDecimalSchema.optional(),
  financedInsurance: positiveDecimalSchema.optional(),
  financedFees: positiveDecimalSchema.optional(),
};

/** PRICE — parcelas fixas, mesmo shape de `createLoanSchema` (reusa `installments.ts` `splitLoanInstallmentAmounts`) + juros obrigatório (diferente de LOAN, onde juros é opcional). */
const priceFinancingSchema = z.object({
  ...financingCommonFields,
  amortizationSystem: z.literal(AmortizationSystem.PRICE),
  totalToPay: positiveDecimalSchema,
  installmentsCount: z.coerce.number().int().min(1, "Mínimo de 1 parcela").max(360, "Máximo de 360 parcelas"),
  installmentAmount: positiveDecimalSchema,
  firstDueDate: dateInputSchema,
  interestRate: positiveDecimalSchema,
  interestPeriod: z.enum(INTEREST_PERIOD_VALUES),
});

/** SAC — amortização constante, parcela decrescente. `totalToPay`/`installmentAmount` NÃO vêm do usuário — derivados do cronograma calculado (`installments.ts` `generateSacInstallmentAmounts`). */
const sacFinancingSchema = z.object({
  ...financingCommonFields,
  amortizationSystem: z.literal(AmortizationSystem.SAC),
  installmentsCount: z.coerce.number().int().min(1, "Mínimo de 1 parcela").max(360, "Máximo de 360 parcelas"),
  firstDueDate: dateInputSchema,
  interestRate: positiveDecimalSchema,
  interestPeriod: z.enum(INTEREST_PERIOD_VALUES),
});

/** Uma linha do cronograma CUSTOM (tabela extraída de um documento do banco — Stage 3/Gemini). Usada como veio, nunca recalculada. */
const customFinancingScheduleItemSchema = z.object({
  amount: positiveDecimalSchema,
  dueDate: dateInputSchema,
});

/** CUSTOM — cronograma explícito. `totalToPay` opcional: se informado, valida contra a soma do `schedule` (tolerância de centavos, ver `installments.ts`); se ausente, é derivado da soma. Juros opcional (o cronograma já traz os valores prontos; sem juros configurado, antecipação cai pro valor cheio, mesma regra de LOAN). */
const customFinancingSchema = z.object({
  ...financingCommonFields,
  amortizationSystem: z.literal(AmortizationSystem.CUSTOM),
  totalToPay: positiveDecimalSchema.optional(),
  interestRate: positiveDecimalSchema.optional(),
  interestPeriod: z.enum(INTEREST_PERIOD_VALUES).optional(),
  schedule: z.array(customFinancingScheduleItemSchema).min(1, "Informe ao menos 1 parcela"),
});

export const createFinancingSchema = z
  .discriminatedUnion("amortizationSystem", [priceFinancingSchema, sacFinancingSchema, customFinancingSchema])
  .superRefine((data, ctx) => {
    if (data.amortizationSystem === AmortizationSystem.PRICE && Number(data.totalToPay) < Number(data.principal)) {
      ctx.addIssue({ code: "custom", message: "Total a pagar não pode ser menor que o principal", path: ["totalToPay"] });
    }
    if (
      data.amortizationSystem === AmortizationSystem.CUSTOM &&
      Boolean(data.interestRate) !== Boolean(data.interestPeriod)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Informe taxa de juros e período juntos, ou nenhum dos dois",
        path: ["interestRate"],
      });
    }
  });

export type CreateFinancingInput = z.infer<typeof createFinancingSchema>;
