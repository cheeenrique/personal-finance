import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { loanService } from "@/modules/loans/service";
import { LoanNotFoundError } from "@/modules/loans/errors";
import { LoanDetailView } from "@/components/loans/loan-detail-view";
import type { LoanDetailData } from "@/components/loans/types";

type LoanDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * `/loans/[id]`: principal, total a pagar, juros, saldo devedor, progresso +
 * lista completa das parcelas (marcar como paga) + excluir. Server Component:
 * lê via `loanService.getLoanDetail` direto (mesmo padrão de `/accounts/[id]`,
 * ver docs/99-CLAUDE.md "Regra de Ouro"). `LoanNotFoundError` (erro de
 * domínio tipado, ver `modules/loans/errors.ts`) é mapeado pro boundary HTTP
 * equivalente (`notFound()`) aqui — mesmo racional de
 * ~/.claude/rules/06-composition-errors.md.
 */
export default async function LoanDetailPage({ params }: LoanDetailPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  let loan;
  try {
    loan = await loanService.getLoanDetail(userId, id);
  } catch (error) {
    if (error instanceof LoanNotFoundError) notFound();
    throw error;
  }

  const loanView: LoanDetailData = {
    id: loan.id,
    description: loan.description,
    lender: loan.lender,
    principal: loan.principal.toString(),
    totalToPay: loan.totalToPay.toString(),
    interest: loan.interest.toString(),
    installmentAmount: loan.installmentAmount.toString(),
    installmentsCount: loan.installmentsCount,
    paidCount: loan.paidCount,
    paidAmount: loan.paidAmount.toString(),
    remainingAmount: loan.remainingAmount.toString(),
    nextInstallment: loan.nextInstallment
      ? { date: loan.nextInstallment.date.toISOString(), amount: loan.nextInstallment.amount.toString() }
      : null,
    installments: loan.installments.map((installment) => ({
      id: installment.id,
      amount: installment.amount.toString(),
      date: installment.date.toISOString(),
      isPaid: installment.isPaid,
    })),
    disbursement: loan.disbursement
      ? { amount: loan.disbursement.amount.toString(), date: loan.disbursement.date.toISOString() }
      : null,
    firstDueDate: loan.firstDueDate.toISOString(),
    accountId: loan.accountId,
    categoryId: loan.categoryId,
    interestRate: loan.interestRate ? loan.interestRate.toString() : null,
    interestPeriod: loan.interestPeriod,
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/loans"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Empréstimos
      </Link>

      <LoanDetailView loan={loanView} />
    </div>
  );
}
