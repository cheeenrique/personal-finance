import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { loanService } from "@/modules/loans/service";
import { simulateAmortization } from "@/modules/loans/simulate";
import { assetService } from "@/modules/assets/service";
import { LoanNotFoundError } from "@/modules/loans/errors";
import { LoanKind, AmortizationSystem } from "@/generated/prisma/enums";
import { FinancingDetailView } from "@/components/financings/financing-detail-view";
import type { FinancingDetailData } from "@/components/financings/types";

type FinancingDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * `/financings/[id]`: principal, total a pagar, juros, saldo devedor
 * (nominal + "quitar hoje"), contrato (entrada/valor do bem/CET/custos) +
 * progresso + parcelas — espelha `/loans/[id]`
 * (`app/(app)/loans/[id]/page.tsx`). Server Component: lê via
 * `loanService.getLoanDetail` direto (docs/99-CLAUDE.md "Regra de Ouro").
 * `LoanNotFoundError` mapeado pro boundary HTTP equivalente (`notFound()`),
 * mesmo racional de `~/.claude/rules/06-composition-errors.md`. Um `Loan`
 * `kind=LOAN` acessado via esta rota também vira 404 — `/financings` é seção
 * própria, não mostra empréstimo comum (mesmo raciocínio inverso de
 * `/loans` filtrar `kind=LOAN` na listagem).
 */
export default async function FinancingDetailPage({ params }: FinancingDetailPageProps) {
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

  if (loan.kind !== LoanKind.FINANCING) notFound();

  const unpaidInstallments = loan.installments.filter((installment) => !installment.isPaid);
  const settleTodayAmount =
    unpaidInstallments.length > 0
      ? simulateAmortization(loan, loan.installments, { type: "full", paymentDate: new Date() }).totalToPayToday.toString()
      : null;

  let assetName: string | null = null;
  if (loan.assetId) {
    const assets = await assetService.list(userId);
    assetName = assets.find((asset) => asset.id === loan.assetId)?.name ?? null;
  }

  const financingView: FinancingDetailData = {
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
    amortizationSystem: loan.amortizationSystem ?? AmortizationSystem.PRICE,
    downPayment: loan.downPayment ? loan.downPayment.toString() : null,
    assetValue: loan.assetValue ? loan.assetValue.toString() : null,
    assetId: loan.assetId,
    assetName,
    cet: loan.cet ? loan.cet.toString() : null,
    operationRef: loan.operationRef,
    financedTaxes: loan.financedTaxes ? loan.financedTaxes.toString() : null,
    financedInsurance: loan.financedInsurance ? loan.financedInsurance.toString() : null,
    financedFees: loan.financedFees ? loan.financedFees.toString() : null,
    settleTodayAmount,
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/financings"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Financiamentos
      </Link>

      <FinancingDetailView financing={financingView} />
    </div>
  );
}
