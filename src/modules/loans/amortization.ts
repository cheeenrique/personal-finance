import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { loanRepository } from "./repository";
import { loanService } from "./service";
import { simulateAmortization } from "./simulate";
import { LoanNotFoundError, LoanAdvanceConflictError } from "./errors";
import type { LoanWithTransactions, Money } from "./types";
import type { SimulateAmortizationInput } from "./schemas";
import type { LoanAmortizationSimulation } from "./simulate";

/**
 * Orquestra "ler o empréstimo + simular" (`simulate.ts` é puro, não lê
 * banco) — reusado pelo preview (`previewAmortization`, read-only) e pelo
 * `executeAmortization` (que recalcula de novo DENTRO da própria
 * `$transaction`, nunca confiando no total calculado aqui fora). Arquivo
 * próprio (não `service.ts`): evita inflar `service.ts` (rule
 * 05-naming-size.md, já no limite) e evita ciclo — `amortization.ts` importa
 * de `service.ts` (`loanService.settleLoan`) numa via só, `service.ts` nunca
 * importa `amortization.ts` de volta (mesmo raciocínio de `update.ts`).
 */
function toExpenseInstallments(loan: LoanWithTransactions) {
  return loan.transactions.filter((transaction) => transaction.type === TransactionType.EXPENSE);
}

/** Preview (não grava) — insumo de `simulateAmortizationAction`. Lê o empréstimo fora de transação (leitura simples, sem escrita concorrente a proteger). */
export async function previewAmortization(
  userId: string,
  loanId: string,
  params: SimulateAmortizationInput,
): Promise<LoanAmortizationSimulation> {
  const loan = await loanRepository.findByIdWithTransactions(userId, loanId);
  if (!loan) throw new LoanNotFoundError(loanId);

  return simulateAmortization(loan, toExpenseInstallments(loan), params);
}

/** Grava a Transaction consolidada do pagamento (EXPENSE, já paga) — parcelas antecipadas são substituídas por ela (ver `simulate.ts`, o valor pago vira 1 lançamento só). */
async function insertAmortizationPayment(
  tx: Prisma.TransactionClient,
  input: { userId: string; loanId: string; accountId: string; categoryId: string | null; description: string; amount: Money; date: Date },
) {
  return tx.transaction.create({
    data: {
      userId: input.userId,
      description: input.description,
      type: TransactionType.EXPENSE,
      amount: input.amount,
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: input.date,
      isPaid: true,
      paidAt: input.date,
      loanId: input.loanId,
    },
  });
}

/**
 * Grava a antecipação (docs da tarefa, "Executar"). `type: "full"` reusa
 * `settleLoan` inteiro (`service.ts`) — quitação em lote já é atômica e já
 * marca cada parcela paga com o valor rateado, sem criar Transaction
 * consolidada extra (evitaria contar o pagamento 2x no saldo da conta).
 *
 * `type: "advance"` roda na PRÓPRIA `$transaction`: relê o empréstimo (nunca
 * confia no `params` recalculado fora), reSimula (`simulateAmortization`) pra
 * obter as parcelas selecionadas + o total, soft-deleta essas parcelas
 * (recheck `isPaid=false`, `loanRepository.softDeleteInstallmentsByIds`) e
 * grava 1 Transaction EXPENSE já paga com o total (substitui as parcelas
 * antecipadas no cronograma — mesma decisão de `deleteLoan`/`updateLoan`
 * sobre o que soft-deletar vs. o que preservar).
 *
 * Retorna o total efetivamente pago (`Money`) — mesmo contrato de
 * `settleLoan`, serializado pra string em `actions.ts`.
 */
export async function executeAmortization(
  userId: string,
  loanId: string,
  params: SimulateAmortizationInput,
): Promise<Money> {
  if (params.type === "full") {
    return loanService.settleLoan(userId, loanId, params.paymentDate);
  }

  return prisma.$transaction(async (tx) => {
    const loan = await loanRepository.findByIdWithTransactions(userId, loanId, tx);
    if (!loan) throw new LoanNotFoundError(loanId);

    const simulation = simulateAmortization(loan, toExpenseInstallments(loan), params);

    const deletedCount = await loanRepository.softDeleteInstallmentsByIds(
      userId,
      loanId,
      simulation.installments.ids,
      tx,
    );
    if (deletedCount !== simulation.installments.count) {
      throw new LoanAdvanceConflictError({
        expected: simulation.installments.count,
        deleted: deletedCount,
      });
    }

    await insertAmortizationPayment(tx, {
      userId,
      loanId,
      accountId: loan.accountId,
      categoryId: loan.categoryId,
      description: `Antecipação — ${loan.description}`,
      amount: simulation.totalToPayToday,
      date: params.paymentDate,
    });

    return simulation.totalToPayToday;
  });
}
