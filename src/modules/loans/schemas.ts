import { z } from "zod";
import { positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";

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
