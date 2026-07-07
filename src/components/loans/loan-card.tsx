import Link from "next/link";
import { Plus } from "lucide-react";

import { ProgressBar } from "@/components/dashboard/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import type { LoanCardView } from "./types";

type LoanCardProps = { loan: LoanCardView };

/**
 * Card de empréstimo na grid de `/loans` — finalidade + credor, progresso
 * (`paidAmount`/`totalToPay`, mesma base do handoff), parcela atual (N/M),
 * saldo devedor e próxima parcela. "Detalhes" navega pra `/loans/[id]`
 * (rota própria — diferente de Parcelamentos, que não tem detalhe em página,
 * só modal, ver `InstallmentPurchaseCard`). Tom `neutral` (azul/primário):
 * Parcelamento já é o dono do laranja/`accent` (docs/04-DESIGN_SYSTEM.md,
 * "Cores Financeiras" — evita colisão visual com esse tom em outra dívida).
 */
export function LoanCard({ loan }: LoanCardProps) {
  const percent = (Number(loan.paidAmount) / Number(loan.totalToPay)) * 100;
  const { nextInstallment } = loan;

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold text-foreground">{loan.description}</p>
          {loan.lender && (
            <p className="truncate text-[12px] font-semibold text-muted-foreground">{loan.lender}</p>
          )}
        </div>
        <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
          {loan.paidCount}/{loan.installmentsCount}
        </span>
      </div>

      <ProgressBar
        percent={percent}
        tone="neutral"
        label={`${formatBRL(loan.paidAmount)} pagos · ${formatBRL(loan.remainingAmount)} restantes`}
      />

      <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
        <div>
          <p className="font-semibold text-muted-foreground">Saldo devedor</p>
          <p className="font-mono font-bold text-foreground">{formatBRL(loan.remainingAmount)}</p>
        </div>

        {nextInstallment ? (
          <div className="text-right">
            <p className="font-semibold text-muted-foreground">Próxima parcela</p>
            <p className="font-mono font-bold text-foreground">
              {formatBRL(nextInstallment.amount)} · {formatDateSaoPaulo(nextInstallment.date)}
            </p>
          </div>
        ) : (
          <span className="rounded-full bg-success/16 px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-on-success">
            Quitado
          </span>
        )}
      </div>

      <Link href={`/loans/${loan.id}`} className={buttonVariants({ variant: "outline", className: "mt-1 w-full" })}>
        Detalhes
      </Link>
    </div>
  );
}

/** Tile "+ Novo empréstimo" — mesmo padrão de `NewInstallmentTile`/`NewAccountTile`. */
export function NewLoanTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      <span className="flex size-10 items-center justify-center rounded-[11px] bg-accent/16">
        <Plus className="size-5 text-accent" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold">Novo empréstimo</span>
    </button>
  );
}
