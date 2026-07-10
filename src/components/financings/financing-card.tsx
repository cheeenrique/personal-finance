import Link from "next/link";
import { Eye, Plus } from "lucide-react";

import { ProgressBar } from "@/components/dashboard/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { AmortizationSystem } from "@/generated/prisma/enums";
import type { FinancingCardView } from "./types";

type FinancingCardProps = { financing: FinancingCardView };

const AMORTIZATION_SYSTEM_LABELS: Record<AmortizationSystem, string> = {
  [AmortizationSystem.PRICE]: "Price",
  [AmortizationSystem.SAC]: "SAC",
  [AmortizationSystem.CUSTOM]: "Personalizado",
};

/**
 * Card de financiamento na grid de `/financings` — espelha `LoanCard`
 * (`components/loans/loan-card.tsx`), mesma base (progresso, parcela
 * atual, saldo devedor, próxima parcela), + a pill do sistema de
 * amortização (Price/SAC/Personalizado — só informativo, sem regra por
 * trás no card). Tom `neutral` mantido — financiamento não tem cor própria
 * no design system (docs/04-DESIGN_SYSTEM.md, "Cores Financeiras"), reusa a
 * mesma de Empréstimo (mesma família de dívida parcelada na conta).
 */
export function FinancingCard({ financing }: FinancingCardProps) {
  const percent = (Number(financing.paidAmount) / Number(financing.totalToPay)) * 100;
  const { nextInstallment } = financing;

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold text-foreground">{financing.description}</p>
          {financing.lender && (
            <p className="truncate text-[12px] font-semibold text-muted-foreground">{financing.lender}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10.5px] font-bold text-muted-foreground">
          {AMORTIZATION_SYSTEM_LABELS[financing.amortizationSystem]}
        </span>
      </div>

      <ProgressBar
        percent={percent}
        tone="neutral"
        label={`${formatBRL(financing.paidAmount)} pagos · ${formatBRL(financing.remainingAmount)} restantes`}
      />

      <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
        <div>
          <p className="font-semibold text-muted-foreground">Saldo devedor</p>
          <p className="font-mono font-semibold text-foreground">{formatBRL(financing.remainingAmount)}</p>
        </div>

        {nextInstallment ? (
          <div className="text-right">
            <p className="font-semibold text-muted-foreground">Próxima parcela</p>
            <p className="font-mono font-semibold text-foreground">
              {formatBRL(nextInstallment.amount)} · {formatDateSaoPaulo(nextInstallment.date)}
            </p>
          </div>
        ) : (
          <span className="rounded-full bg-success/16 px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-on-success">
            Quitado
          </span>
        )}
      </div>

      <Link
        href={`/financings/${financing.id}`}
        className={cn(
          buttonVariants({
            variant: "neutral",
            className: "mt-1 h-9 w-full gap-[7px] rounded-[10px] px-3.5 text-[13px] font-bold",
          }),
        )}
      >
        <Eye className="size-[15px]" strokeWidth={2} aria-hidden="true" />
        Detalhes
      </Link>
    </div>
  );
}

/** Tile "+ Novo financiamento" — mesmo padrão de `NewLoanTile`/`NewInstallmentTile`. */
export function NewFinancingTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      <span className="flex size-10 items-center justify-center rounded-[11px] bg-accent/16">
        <Plus className="size-5 text-accent" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold">Novo financiamento</span>
    </button>
  );
}
