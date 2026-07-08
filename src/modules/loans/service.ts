import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { loanRepository } from "./repository";
import { loanOwnership } from "./ownership";
import { monthlyRate, monthsEarly, presentValue, earlyPaymentSuggestion, distributeProportionally } from "./interest";
import { LoanNotFoundError, LoanAccountNotFoundError, LoanCategoryNotFoundError, LoanInstallmentNotFoundError, LoanAlreadySettledError } from "./errors";
import type { LoanWithProgress, LoanWithTransactions, LoanWithInstallments, LoanDisbursement, Money } from "./types";
import type { EarlyPaymentSuggestion } from "./interest";

/** Exportado para reuso por `installments.ts` (mesma regra de ownership, sem duplicar query) — mesmo padrão de `modules/transactions/service.ts`. */
export async function assertAccountOwnership(userId: string, accountId: string): Promise<void> {
  const exists = await loanOwnership.accountExists(userId, accountId);
  if (!exists) throw new LoanAccountNotFoundError(accountId);
}

export async function assertCategoryOwnership(userId: string, categoryId: string): Promise<void> {
  const exists = await loanOwnership.categoryExists(userId, categoryId);
  if (!exists) throw new LoanCategoryNotFoundError(categoryId);
}

/**
 * Progresso derivado de um empréstimo (docs/03-DATABASE.md, model Loan):
 * `paidAmount`/`paidCount` somam as parcelas com `isPaid=true` REAL (não por
 * data — diferente de `InstallmentPurchase`, ver types.ts `LoanWithProgress`).
 * `nextInstallment` é a parcela não paga de menor `date` — as parcelas já
 * vêm ordenadas por `date asc` do repository, então o primeiro item não pago
 * já é o próximo vencimento.
 *
 * CRÍTICO: filtra `type=EXPENSE` antes de qualquer cálculo — `loan.transactions`
 * pode conter também o desembolso (`type=INCOME`, ver `findDisbursement`
 * abaixo). Sem esse filtro, um desembolso linkado contaria como "parcela
 * paga" e explodiria `paidAmount`/`remainingAmount`.
 *
 * `totalToPay` (`Loan`) é sempre o valor CONTRATUAL, nunca recalculado por
 * esta função. `paidAmount` é derivado somando o `amount` REAL de cada
 * parcela paga — quando uma parcela foi quitada com desconto de antecipação
 * (`interest.ts` `presentValue`/`settleLoan`), esse `amount` é MENOR que o
 * previsto no contrato original. Ou seja: `remainingAmount` (`totalToPay -
 * paidAmount`) pode ficar ligeiramente maior que a soma das parcelas ainda
 * não pagas quando há antecipação no meio do caminho — o efetivo pago foi
 * menor que o previsto, exatamente como acontece no empréstimo real do dono
 * (ver tarefa "Cuidados"). Isso é esperado, não um bug.
 *
 * Exportada (além de usada internamente) pra reuso por `update.ts`
 * `updateLoan` — mesma derivação, sem duplicar.
 */
export function deriveLoanProgress(loan: LoanWithTransactions): LoanWithProgress {
  const { transactions, ...loanFields } = loan;
  const installments = transactions.filter((transaction) => transaction.type === TransactionType.EXPENSE);
  const paid = installments.filter((transaction) => transaction.isPaid);
  const nextUnpaid = installments.find((transaction) => !transaction.isPaid);
  const paidAmount = paid.reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0));

  return {
    ...loanFields,
    interest: loan.totalToPay.minus(loan.principal),
    paidAmount,
    remainingAmount: loan.totalToPay.minus(paidAmount),
    paidCount: paid.length,
    nextInstallment: nextUnpaid ? { date: nextUnpaid.date, amount: nextUnpaid.amount } : null,
  };
}

/**
 * Desembolso (`type=INCOME` com esse `loanId`) — no máximo 1 por empréstimo
 * (docs/03-DATABASE.md). `null` quando ainda não foi linkado manualmente.
 * Nunca entra em `deriveLoanProgress` — ver JSDoc acima.
 */
function findDisbursement(loan: LoanWithTransactions): LoanDisbursement {
  const disbursement = loan.transactions.find((transaction) => transaction.type === TransactionType.INCOME);
  return disbursement ? { amount: disbursement.amount, date: disbursement.date } : null;
}

/** Empréstimos ativos do usuário + progresso derivado (insumo da listagem `/loans`). */
async function listLoans(userId: string): Promise<LoanWithProgress[]> {
  const loans = await loanRepository.list(userId);
  return loans.map(deriveLoanProgress);
}

/** Busca UM empréstimo completo por id (escopado a `userId`) + progresso derivado. */
async function getLoan(userId: string, id: string): Promise<LoanWithProgress> {
  const loan = await loanRepository.findByIdWithTransactions(userId, id);
  if (!loan) throw new LoanNotFoundError(id);
  return deriveLoanProgress(loan);
}

/**
 * Mesma busca de `getLoan`, mas mantém as parcelas cruas (`transactions`,
 * filtradas por `type=EXPENSE`) + o desembolso separado (`type=INCOME`) no
 * retorno — insumo exclusivo da tela `/loans/[id]` (lista de parcelas +
 * "marcar paga" + bloco "Entrada"). Função própria em vez de alterar
 * `getLoan`: preserva o contrato existente de `getLoanAction` (que serializa
 * `LoanWithProgress` pra Client Component — um `Prisma.Decimal` esquecido
 * dentro de `installments` quebraria essa serialização) sem duplicar a
 * query; duplica só a composição do retorno (rule 02-dry-kiss-yagni: 2ª
 * ocorrência, aceitável).
 */
async function getLoanDetail(userId: string, id: string): Promise<LoanWithInstallments> {
  const loan = await loanRepository.findByIdWithTransactions(userId, id);
  if (!loan) throw new LoanNotFoundError(id);

  const installments = loan.transactions.filter((transaction) => transaction.type === TransactionType.EXPENSE);
  return { ...deriveLoanProgress(loan), installments, disbursement: findDisbursement(loan) };
}

/**
 * Empréstimos com saldo devedor (`paidCount < installmentsCount`) — insumo
 * do bloco "Empréstimos ativos" do Dashboard, mesmo filtro de
 * `transactionService.listActiveInstallmentPurchases`.
 */
async function listActiveLoans(userId: string): Promise<LoanWithProgress[]> {
  const loans = await listLoans(userId);
  return loans.filter((loan) => loan.paidCount < loan.installmentsCount);
}

/**
 * Soft delete do empréstimo (docs/03-DATABASE.md, "Soft Delete"). Decisão:
 * parcelas FUTURAS ainda não pagas (`isPaid=false`) recebem soft delete junto
 * — deixar de existir como dívida prevista faz sentido ao cancelar o
 * empréstimo, mesma regra de "Cancelamento" de `InstallmentPurchase`
 * (docs/23-INSTALLMENTS.md). Parcelas JÁ PAGAS (`isPaid=true`) mantêm o
 * histórico intacto — já são fatos financeiros ocorridos (saíram da conta),
 * apagá-las reescreveria o passado. As duas escritas rodam na mesma
 * `$transaction` pra não deixar o empréstimo soft-deletado com parcelas
 * futuras órfãs em caso de falha no meio do caminho.
 */
async function deleteLoan(userId: string, id: string): Promise<void> {
  const existing = await loanRepository.findById(userId, id);
  if (!existing) throw new LoanNotFoundError(id);

  await prisma.$transaction(async (tx) => {
    await loanRepository.softDeleteUnpaidInstallments(userId, id, tx);
    const deleted = await loanRepository.softDelete(userId, id, tx);
    if (!deleted) throw new LoanNotFoundError(id);
  });
}

/**
 * Sugestão de antecipação pra UMA parcela (docs da tarefa, "Antecipação") —
 * só CALCULA, nunca grava nada. O front chama isso quando o usuário marca
 * uma parcela como paga com `paymentDate` antes do vencimento, pra
 * pré-preencher o valor com desconto (editável — decisão do dono).
 *
 * Confirmar o pagamento em si (gravar `amount`/`isPaid`/`paidAt`) continua
 * passando por `updateTransactionAction` (`modules/transactions`) — já
 * cobre `amount`+`isPaid`+`paidAt=now()` na transição pendente→paga (ver
 * `transactions/service.ts` `resolvePaidAtOnUpdate`), o mesmo caminho que
 * `loan-detail-view.tsx` já usa hoje pra marcar parcela paga. Não duplicar
 * esse update aqui.
 */
async function suggestEarlyPayment(
  userId: string,
  loanId: string,
  installmentId: string,
  paymentDate: Date,
): Promise<EarlyPaymentSuggestion> {
  const loan = await loanRepository.findById(userId, loanId);
  if (!loan) throw new LoanNotFoundError(loanId);

  const installment = await loanRepository.findInstallment(userId, loanId, installmentId);
  if (!installment) throw new LoanInstallmentNotFoundError(installmentId);

  return earlyPaymentSuggestion(loan, installment, paymentDate);
}

/**
 * Quita TODAS as parcelas não pagas de um empréstimo de uma vez —
 * diferente de marcar UMA parcela paga (`suggestEarlyPayment` +
 * `updateTransactionAction`, ver JSDoc acima), aqui precisamos gravar N
 * `Transaction`s atomicamente na MESMA `$transaction` com um valor
 * RATEADO entre elas — capacidade que `updateTransactionAction` não tem
 * (ele só toca UMA transação por chamada, sem noção de "ratear um total
 * entre várias"). Por isso escreve direto via `loanRepository`, sem
 * reusar o módulo `transactions`.
 *
 * `totalPaid` ausente → usa o total SUGERIDO (Σ valor presente de cada
 * parcela não paga, `interest.ts` `presentValue` — sem juros configurado,
 * PV = valor cheio, mesma regra de sempre). `totalPaid` informado → é o
 * valor que o usuário editou/confirmou (mesma filosofia de `suggested` em
 * `earlyPaymentSuggestion`: sugestão é só ponto de partida).
 *
 * O valor final é distribuído proporcional ao PV de cada parcela
 * (`interest.ts` `distributeProportionally`) — parcelas mais distantes do
 * vencimento (mais desconto) recebem uma fatia proporcionalmente menor.
 * Todas ganham `isPaid=true`/`paidAt=settleDate` — `amount` de cada uma
 * passa a refletir o valor REAL pago (menor que o prescrito no contrato
 * quando há desconto de antecipação — ver `deriveLoanProgress` acima:
 * `totalToPay` continua CONTRATUAL, o `paidAmount` derivado é que reflete
 * o efetivo, exatamente como já acontece no empréstimo real do dono).
 *
 * Lê as parcelas (`findByIdWithTransactions`) DENTRO da MESMA `$transaction`
 * que grava a quitação — não antes dela — pra reduzir a janela de corrida
 * contra uma parcela sendo marcada paga individualmente nesse meio-tempo
 * (`updateTransactionAction`, fora desta transação). O fechamento definitivo
 * do TOCTOU é o `updateMany` com recheck de `isPaid=false` em
 * `loanRepository.markInstallmentPaid` (docs backlog L4) — a leitura aqui só
 * encurta a janela, ela sozinha não é suficiente (leitura e escrita não são
 * atômicas entre si).
 */
async function settleLoan(userId: string, loanId: string, settleDate: Date, totalPaid?: string): Promise<Money> {
  return prisma.$transaction(async (tx) => {
    const loan = await loanRepository.findByIdWithTransactions(userId, loanId, tx);
    if (!loan) throw new LoanNotFoundError(loanId);

    const installments = loan.transactions.filter((transaction) => transaction.type === TransactionType.EXPENSE);
    const unpaid = installments.filter((transaction) => !transaction.isPaid);
    if (unpaid.length === 0) throw new LoanAlreadySettledError(loanId);

    const rate = monthlyRate(loan);
    const presentValues = unpaid.map((installment) =>
      presentValue(installment.amount, rate, monthsEarly(settleDate, installment.date)),
    );
    const suggestedTotal = presentValues.reduce((sum, pv) => sum.plus(pv), new Prisma.Decimal(0));
    const finalTotal = totalPaid !== undefined ? new Prisma.Decimal(totalPaid) : suggestedTotal;

    const amounts = distributeProportionally(finalTotal, presentValues);

    for (let index = 0; index < unpaid.length; index += 1) {
      // sequencial de propósito, mesmo padrão de installments.ts createLoan (regra no-await-in-loop não configurada neste projeto)
      await loanRepository.markInstallmentPaid(unpaid[index].id, amounts[index], settleDate, tx);
    }

    return finalTotal;
  });
}

export const loanService = {
  listLoans,
  listActiveLoans,
  getLoan,
  getLoanDetail,
  deleteLoan,
  suggestEarlyPayment,
  settleLoan,
};
