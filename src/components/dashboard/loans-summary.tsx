import Link from "next/link";
import { HandCoins } from "lucide-react";

import type { LoanWithProgress } from "@/modules/loans/types";
import { SectionCard } from "./section-card";
import { ProgressBar } from "./progress-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";

type LoansSummaryProps = {
  loans: LoanWithProgress[];
};

const MAX_VISIBLE_LOANS = 5;

/**
 * Bloco "Empréstimos ativos" do Dashboard — mesmo padrão de
 * `InstallmentsSummary`/`CardsSummary`: 1 linha por empréstimo, progresso
 * (`paidAmount`/`totalToPay`). Diferente de Parcelamentos (sem rota de
 * detalhe própria, só modal via `?open=`), aqui o clique vai direto pra
 * `/loans/[id]` — Empréstimos tem página de detalhe real.
 *
 * Mostra só os `MAX_VISIBLE_LOANS` mais recentes — `loanService.listActiveLoans`
 * já vem ordenado por `createdAt desc` (repository), então o slice aqui
 * preserva "mais recentes primeiro". "Ver todos" cobre o restante em `/loans`.
 */
export function LoansSummary({ loans }: LoansSummaryProps) {
  if (loans.length === 0) {
    return (
      <SectionCard title="Empréstimos ativos">
        <EmptyState
          icon={HandCoins}
          title="Nenhum empréstimo ativo"
          description="Registre um empréstimo para acompanhar as parcelas e o saldo devedor."
          className="min-h-0 border-none py-2"
        />
        <Link href="/loans" className={buttonVariants({ variant: "accent", className: "mt-3 w-full" })}>
          Novo empréstimo
        </Link>
      </SectionCard>
    );
  }

  const recentLoans = loans.slice(0, MAX_VISIBLE_LOANS);

  return (
    <SectionCard title="Empréstimos ativos" action={{ label: "Ver todos", href: "/loans" }}>
      <div className="flex flex-col gap-4">
        {recentLoans.map((loan) => {
          const percent = (loan.paidAmount.toNumber() / loan.totalToPay.toNumber()) * 100;

          return (
            <Link key={loan.id} href={`/loans/${loan.id}`} className="block">
              <div className="mb-[7px] flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-extrabold text-foreground">
                  {loan.description}{" "}
                  <span className="font-mono text-[11px] font-normal text-on-primary">
                    {loan.paidCount}/{loan.installmentsCount}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  restam {formatBRL(loan.remainingAmount.toNumber())}
                </span>
              </div>

              <ProgressBar
                percent={percent}
                tone="neutral"
                label={`${formatBRL(loan.paidAmount.toNumber())} pagos · ${formatBRL(loan.remainingAmount.toNumber())} restantes`}
                showLabel={false}
                className="space-y-0"
              />
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
