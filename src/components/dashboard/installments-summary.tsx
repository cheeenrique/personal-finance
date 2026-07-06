import Link from "next/link";
import { Layers3 } from "lucide-react";

import type { ActiveInstallmentPurchase } from "@/modules/transactions/types";
import { SectionCard } from "./section-card";
import { ProgressBar } from "./progress-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";

type InstallmentsSummaryProps = {
  purchases: ActiveInstallmentPurchase[];
};

/**
 * Bloco "Parcelamentos Ativos" (docs/11-DASHBOARD.md, "4. Parcelamentos
 * Ativos"; docs/23-INSTALLMENTS.md, "Visual no Dashboard"): 1 card por
 * compra, progresso de parcelas — nunca lista parcelas soltas.
 */
export function InstallmentsSummary({ purchases }: InstallmentsSummaryProps) {
  if (purchases.length === 0) {
    return (
      <SectionCard title="Parcelamentos ativos">
        <EmptyState
          icon={Layers3}
          title="Nenhum parcelamento ativo"
          description="Compras parceladas no cartão aparecem aqui com o progresso das parcelas."
          className="min-h-0 border-none py-2"
        />
        <Link href="/installments" className={buttonVariants({ variant: "accent", className: "mt-3 w-full" })}>
          Novo parcelamento
        </Link>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Parcelamentos ativos" action={{ label: "Ver todos", href: "/installments" }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {purchases.map((purchase) => {
          const percent = (purchase.paidCount / purchase.installmentsCount) * 100;

          return (
            <Link
              key={purchase.id}
              href="/installments"
              className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-extrabold text-foreground">{purchase.description}</span>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {purchase.paidCount}/{purchase.installmentsCount}
                </span>
              </div>

              <ProgressBar
                percent={percent}
                tone="accent"
                label={`${formatBRL(purchase.paidAmount.toNumber())} pagos · ${formatBRL(purchase.remainingAmount.toNumber())} restantes`}
              />

              <span className="truncate text-[11.5px] font-semibold text-muted-foreground">{purchase.cardName}</span>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
