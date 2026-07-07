import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { loanRepository } from "./repository";
import { loanOwnership } from "./ownership";
import { LoanNotFoundError, LoanAccountNotFoundError, LoanCategoryNotFoundError } from "./errors";
import type { LoanWithProgress, LoanWithTransactions, LoanWithInstallments } from "./types";

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
 */
function deriveLoanProgress(loan: LoanWithTransactions): LoanWithProgress {
  const { transactions, ...loanFields } = loan;
  const paid = transactions.filter((transaction) => transaction.isPaid);
  const nextUnpaid = transactions.find((transaction) => !transaction.isPaid);
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
 * Mesma busca de `getLoan`, mas mantém as parcelas cruas (`transactions`) no
 * retorno — insumo exclusivo da tela `/loans/[id]` (lista de parcelas +
 * "marcar paga"). Função própria em vez de alterar `getLoan`: preserva o
 * contrato existente de `getLoanAction` (que serializa `LoanWithProgress`
 * pra Client Component — um `Prisma.Decimal` esquecido dentro de
 * `installments` quebraria essa serialização) sem duplicar a query;
 * duplica só a composição do retorno (rule 02-dry-kiss-yagni: 2ª ocorrência,
 * aceitável).
 */
async function getLoanDetail(userId: string, id: string): Promise<LoanWithInstallments> {
  const loan = await loanRepository.findByIdWithTransactions(userId, id);
  if (!loan) throw new LoanNotFoundError(id);
  return { ...deriveLoanProgress(loan), installments: loan.transactions };
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

export const loanService = {
  listLoans,
  listActiveLoans,
  getLoan,
  getLoanDetail,
  deleteLoan,
};
