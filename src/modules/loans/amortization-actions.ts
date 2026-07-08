"use server";

import { previewAmortization, executeAmortization } from "./amortization";
import { amortizationParamsSchema } from "./schemas";
import { requireUserId, UNAUTHENTICATED_ERROR, toActionError, revalidateLoanRoutes } from "./action-helpers";
import type { LoanAmortizationBalance, LoanAmortizationSimulation } from "./simulate";
import type { ActionResult, ClientLoanAmortizationBalance, ClientLoanAmortizationSimulation } from "./types";

/**
 * Server Actions do simulador de antecipação em lote (modelo C6 "Antecipar
 * parcelas", ver `simulate.ts`) — arquivo próprio, separado de `actions.ts`
 * (rule 05-naming-size.md: `actions.ts` só de CRUD/quitação já estava
 * passando de 300 linhas ao ganhar este fluxo). Só delegam para
 * `amortization.ts` (docs/99-CLAUDE.md, "Regra de Ouro").
 */

/** `simulate.ts` `LoanAmortizationBalance` → `ClientLoanAmortizationBalance` (`Prisma.Decimal` → `string` na borda). */
function toClientAmortizationBalance(balance: LoanAmortizationBalance): ClientLoanAmortizationBalance {
  return {
    ...balance,
    nominal: balance.nominal.toString(),
    presentValue: balance.presentValue.toString(),
  };
}

/** `simulate.ts` `LoanAmortizationSimulation` → `ClientLoanAmortizationSimulation` (`Prisma.Decimal` → `string` na borda). */
function toClientAmortizationSimulation(simulation: LoanAmortizationSimulation): ClientLoanAmortizationSimulation {
  return {
    ...simulation,
    interestDiscount: simulation.interestDiscount.toString(),
    totalToPayToday: simulation.totalToPayToday.toString(),
    before: toClientAmortizationBalance(simulation.before),
    after: toClientAmortizationBalance(simulation.after),
  };
}

/** Simulador de antecipação (modelo C6, ver `simulate.ts`) — só calcula, não grava (ver `amortization.ts` `previewAmortization`). */
export async function simulateAmortizationAction(
  loanId: string,
  input: unknown,
): Promise<ActionResult<ClientLoanAmortizationSimulation>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = amortizationParamsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const simulation = await previewAmortization(userId, loanId, parsed.data);
    return { success: true, data: toClientAmortizationSimulation(simulation) };
  } catch (error) {
    return toActionError(error);
  }
}

/** Grava a antecipação simulada por `simulateAmortizationAction` (ver `amortization.ts` `executeAmortization`). Retorna o total pago (string, `Prisma.Decimal` serializado). */
export async function executeAmortizationAction(loanId: string, input: unknown): Promise<ActionResult<string>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = amortizationParamsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const totalPaid = await executeAmortization(userId, loanId, parsed.data);
    revalidateLoanRoutes();
    return { success: true, data: totalPaid.toString() };
  } catch (error) {
    return toActionError(error);
  }
}
