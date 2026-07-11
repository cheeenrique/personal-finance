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

const MAX_VISIBLE_PURCHASES = 5;

/**
 * Bloco "Parcelamentos Ativos" (docs/11-DASHBOARD.md, "4. Parcelamentos
 * Ativos"; docs/23-INSTALLMENTS.md, "Visual no Dashboard"): 1 linha por
 * compra, progresso de parcelas — nunca lista parcelas soltas. Layout igual
 * ao demo (design/Personal Finance App.dc.html, "Parcelamentos ativos").
 * Clique vai direto pro modal de detalhes daquela compra em `/installments`
 * (`?open=<id>`, lido por `InstallmentsBoard`).
 *
 * Mostra só os `MAX_VISIBLE_PURCHASES` mais perto de acabar: sort por menor
 * quantidade de parcelas restantes (`installmentsCount - paidCount`)
 * primeiro, com empate desfeito por menor `remainingAmount` — o sort +
 * slice acontece aqui (sem tocar no service compartilhado). "Ver todos"
 * cobre o restante em `/installments`.
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

  const recentPurchases = [...purchases]
    .sort((a, b) => {
      const remainingCountDiff =
        a.installmentsCount - a.paidCount - (b.installmentsCount - b.paidCount);
      if (remainingCountDiff !== 0) return remainingCountDiff;
      return a.remainingAmount.comparedTo(b.remainingAmount);
    })
    .slice(0, MAX_VISIBLE_PURCHASES);

  return (
    <SectionCard title="Parcelamentos ativos" action={{ label: "Ver todos", href: "/installments" }}>
      <div className="flex flex-col gap-4">
        {recentPurchases.map((purchase) => {
          const percent = (purchase.paidCount / purchase.installmentsCount) * 100;

          return (
            <Link key={purchase.id} href={`/installments?open=${purchase.id}`} className="block">
              <div className="mb-[7px] flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-extrabold text-foreground">
                  {purchase.description}{" "}
                  <span className="font-mono text-[11px] font-normal text-on-accent">
                    {purchase.paidCount}/{purchase.installmentsCount}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  restam {formatBRL(purchase.remainingAmount.toNumber())}
                </span>
              </div>

              <ProgressBar
                percent={percent}
                tone="accent"
                label={`${formatBRL(purchase.paidAmount.toNumber())} pagos · ${formatBRL(purchase.remainingAmount.toNumber())} restantes`}
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
