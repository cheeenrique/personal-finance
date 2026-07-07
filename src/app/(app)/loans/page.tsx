import { auth } from "@/lib/auth";
import { loanService } from "@/modules/loans/service";
import { LoansBoard } from "@/components/loans/loans-board";
import type { LoanCardView } from "@/components/loans/types";

/**
 * `/loans`: lista dos empréstimos ativos (progresso, saldo devedor, próxima
 * parcela). Server Component: lê via `loanService.listLoans` direto (sem
 * passar por Server Action — Server Actions existem só pra mutations
 * disparadas pelo client, ver docs/99-CLAUDE.md "Regra de Ouro", mesmo
 * padrão de `/accounts`/`/installments`). `Prisma.Decimal`/`Date` são
 * convertidos pra string na borda antes de descer pro Client Component (RSC
 * não serializa instância de classe).
 */
export default async function LoansPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const loans = await loanService.listLoans(userId);

  const loansView: LoanCardView[] = loans.map((loan) => ({
    id: loan.id,
    description: loan.description,
    lender: loan.lender,
    totalToPay: loan.totalToPay.toString(),
    installmentsCount: loan.installmentsCount,
    paidCount: loan.paidCount,
    paidAmount: loan.paidAmount.toString(),
    remainingAmount: loan.remainingAmount.toString(),
    nextInstallment: loan.nextInstallment
      ? { date: loan.nextInstallment.date.toISOString(), amount: loan.nextInstallment.amount.toString() }
      : null,
  }));

  return <LoansBoard loans={loansView} />;
}
