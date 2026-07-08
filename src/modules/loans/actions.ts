"use server";

import { loanService } from "./service";
import { createLoan } from "./installments";
import { createFinancing } from "./financing";
import { updateLoan } from "./update";
import { createLoanSchema, updateLoanSchema, suggestEarlyPaymentSchema, settleLoanSchema, createFinancingSchema } from "./schemas";
import { requireUserId, UNAUTHENTICATED_ERROR, toActionError, revalidateLoanRoutes } from "./action-helpers";
import type { EarlyPaymentSuggestion } from "./interest";
import type {
  ActionResult,
  ClientCreateLoanResult,
  ClientEarlyPaymentSuggestion,
  ClientLoanWithProgress,
  CreateLoanResult,
  LoanWithProgress,
} from "./types";

/**
 * Server Actions de empréstimo/financiamento (CRUD + antecipação de UMA
 * parcela + quitação total) — só delegam para o module (docs/99-CLAUDE.md,
 * "Regra de Ouro"). As Server Actions do simulador de antecipação em lote
 * (modelo C6) vivem em `amortization-actions.ts` — arquivo próprio pra não
 * estourar o limite de tamanho deste (rule 05-naming-size.md).
 */

/** `Prisma.Decimal` → `string` na borda (ver types.ts `ClientLoanWithProgress`). */
function toClientLoan(loan: LoanWithProgress): ClientLoanWithProgress {
  return {
    ...loan,
    principal: loan.principal.toString(),
    totalToPay: loan.totalToPay.toString(),
    installmentAmount: loan.installmentAmount.toString(),
    interest: loan.interest.toString(),
    paidAmount: loan.paidAmount.toString(),
    remainingAmount: loan.remainingAmount.toString(),
    nextInstallment: loan.nextInstallment
      ? { date: loan.nextInstallment.date, amount: loan.nextInstallment.amount.toString() }
      : null,
    interestRate: loan.interestRate ? loan.interestRate.toString() : null,
  };
}

/** Reusado por `createLoanAction` (LOAN) e `createFinancingAction` (FINANCING) — os campos de financiamento ficam `null` em LOAN comum (ver docs/03-DATABASE.md, `Loan.kind`). */
function toClientCreateLoanResult(result: CreateLoanResult): ClientCreateLoanResult {
  return {
    loan: {
      ...result.loan,
      principal: result.loan.principal.toString(),
      totalToPay: result.loan.totalToPay.toString(),
      installmentAmount: result.loan.installmentAmount.toString(),
      interestRate: result.loan.interestRate ? result.loan.interestRate.toString() : null,
      downPayment: result.loan.downPayment ? result.loan.downPayment.toString() : null,
      assetValue: result.loan.assetValue ? result.loan.assetValue.toString() : null,
      cet: result.loan.cet ? result.loan.cet.toString() : null,
      financedTaxes: result.loan.financedTaxes ? result.loan.financedTaxes.toString() : null,
      financedInsurance: result.loan.financedInsurance ? result.loan.financedInsurance.toString() : null,
      financedFees: result.loan.financedFees ? result.loan.financedFees.toString() : null,
    },
    transactions: result.transactions.map((transaction) => ({
      ...transaction,
      amount: transaction.amount.toString(),
    })),
  };
}

/** `interest.ts` `EarlyPaymentSuggestion` → `ClientEarlyPaymentSuggestion` (`Prisma.Decimal` → `string` na borda). */
function toClientEarlyPaymentSuggestion(suggestion: EarlyPaymentSuggestion): ClientEarlyPaymentSuggestion {
  return {
    suggested: suggestion.suggested.toString(),
    fullAmount: suggestion.fullAmount.toString(),
    discount: suggestion.discount.toString(),
  };
}

export async function createLoanAction(input: unknown): Promise<ActionResult<ClientCreateLoanResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createLoanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await createLoan(userId, parsed.data);
    revalidateLoanRoutes();
    return { success: true, data: toClientCreateLoanResult(result) };
  } catch (error) {
    return toActionError(error);
  }
}

/** Cria um FINANCIAMENTO (`Loan.kind=FINANCING`, ver `financing.ts` `createFinancing`) — espelha `createLoanAction`, mesmo envelope de retorno (`ClientCreateLoanResult`). */
export async function createFinancingAction(input: unknown): Promise<ActionResult<ClientCreateLoanResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createFinancingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await createFinancing(userId, parsed.data);
    revalidateLoanRoutes();
    return { success: true, data: toClientCreateLoanResult(result) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listLoansAction(): Promise<ActionResult<ClientLoanWithProgress[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const loans = await loanService.listLoans(userId);
    return { success: true, data: loans.map(toClientLoan) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getLoanAction(id: string): Promise<ActionResult<ClientLoanWithProgress>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const loan = await loanService.getLoan(userId, id);
    return { success: true, data: toClientLoan(loan) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteLoanAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await loanService.deleteLoan(userId, id);
    revalidateLoanRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Edita o contrato do empréstimo — regenera parcelas não pagas quando o contrato muda (ver `update.ts` `updateLoan`). */
export async function updateLoanAction(id: string, input: unknown): Promise<ActionResult<ClientLoanWithProgress>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateLoanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const loan = await updateLoan(userId, id, parsed.data);
    revalidateLoanRoutes();
    return { success: true, data: toClientLoan(loan) };
  } catch (error) {
    return toActionError(error);
  }
}

/** Sugestão de antecipação de uma parcela — só calcula, não grava (ver `service.ts` `suggestEarlyPayment`). */
export async function suggestEarlyPaymentAction(
  loanId: string,
  input: unknown,
): Promise<ActionResult<ClientEarlyPaymentSuggestion>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = suggestEarlyPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const suggestion = await loanService.suggestEarlyPayment(
      userId,
      loanId,
      parsed.data.installmentId,
      parsed.data.paymentDate,
    );
    return { success: true, data: toClientEarlyPaymentSuggestion(suggestion) };
  } catch (error) {
    return toActionError(error);
  }
}

/** Quita todas as parcelas não pagas do empréstimo de uma vez (ver `service.ts` `settleLoan`). Retorna o total quitado (string, `Prisma.Decimal` serializado). */
export async function settleLoanAction(loanId: string, input: unknown): Promise<ActionResult<string>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = settleLoanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const totalPaid = await loanService.settleLoan(userId, loanId, parsed.data.settleDate, parsed.data.totalPaid);
    revalidateLoanRoutes();
    return { success: true, data: totalPaid.toString() };
  } catch (error) {
    return toActionError(error);
  }
}
