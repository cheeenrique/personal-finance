import { auth } from "@/lib/auth";
import { loanService } from "@/modules/loans/service";
import { LoanKind, AmortizationSystem } from "@/generated/prisma/enums";
import { FinancingsBoard } from "@/components/financings/financings-board";
import type { FinancingCardView } from "@/components/financings/types";

/**
 * `/financings`: lista dos financiamentos ativos (progresso, saldo devedor,
 * próxima parcela) — espelha `/loans` (`app/(app)/loans/page.tsx`), mas
 * filtrando `kind=FINANCING` (financiamento é `Loan` com esse `kind`, ver
 * docs/03-DATABASE.md). Server Component: lê via `loanService.listLoans`
 * direto (sem Server Action, mesmo racional de `/loans`/`/accounts`, ver
 * docs/99-CLAUDE.md "Regra de Ouro"). `Prisma.Decimal`/`Date` convertidos pra
 * string na borda antes de descer pro Client Component.
 */
export default async function FinancingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const loans = await loanService.listLoans(userId);
  const financings = loans.filter((loan) => loan.kind === LoanKind.FINANCING);

  const financingsView: FinancingCardView[] = financings.map((financing) => ({
    id: financing.id,
    description: financing.description,
    lender: financing.lender,
    totalToPay: financing.totalToPay.toString(),
    installmentsCount: financing.installmentsCount,
    paidCount: financing.paidCount,
    paidAmount: financing.paidAmount.toString(),
    remainingAmount: financing.remainingAmount.toString(),
    nextInstallment: financing.nextInstallment
      ? { date: financing.nextInstallment.date.toISOString(), amount: financing.nextInstallment.amount.toString() }
      : null,
    // `amortizationSystem` nunca é `null` em `kind=FINANCING` (sempre gravado por `createFinancing`, `modules/loans/financing.ts`) — o fallback é só defensivo pro type-checker.
    amortizationSystem: financing.amortizationSystem ?? AmortizationSystem.PRICE,
  }));

  return <FinancingsBoard financings={financingsView} />;
}
