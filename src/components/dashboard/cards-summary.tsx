import Link from "next/link";
import { CreditCard } from "lucide-react";

import type { CardWithSummary } from "@/modules/cards/types";
import { SectionCard } from "./section-card";
import { ProgressBar } from "./progress-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";

/** Faixas de uso do limite — mesmos cortes de `modules/budgets/service.ts` `statusFromProgress` (>100 estourado, >80 atenção). */
function toneForUsage(percent: number): "danger" | "warning" | "neutral" {
  if (percent > 100) return "danger";
  if (percent > 80) return "warning";
  return "neutral";
}

type CardsSummaryProps = {
  cards: CardWithSummary[];
};

/**
 * Bloco "Cartões e Dívidas" (docs/11-DASHBOARD.md, "3. Cartões e Dívidas"):
 * nome, limite total/usado, fatura atual, barra de progresso. Clique leva
 * para `/cards` (detalhe por cartão ainda não tem rota própria).
 */
export function CardsSummary({ cards }: CardsSummaryProps) {
  if (cards.length === 0) {
    return (
      <SectionCard title="Cartões e dívidas">
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão cadastrado"
          description="Cadastre um cartão para acompanhar limite e fatura aqui."
          className="min-h-0 border-none py-2"
        />
        <Link href="/cards" className={buttonVariants({ variant: "accent", className: "mt-3 w-full" })}>
          Novo cartão
        </Link>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Cartões e dívidas" action={{ label: "Ver todos", href: "/cards" }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const limit = card.limit.toNumber();
          const outstanding = card.outstandingBalance.toNumber();
          const percent = limit > 0 ? (outstanding / limit) * 100 : 0;

          return (
            <Link
              key={card.id}
              href="/cards"
              className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-extrabold text-foreground">{card.name}</span>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {formatBRL(card.currentInvoiceTotal.toNumber())}
                </span>
              </div>

              <ProgressBar
                percent={percent}
                tone={toneForUsage(percent)}
                label={`${formatBRL(outstanding)} / ${formatBRL(limit)}`}
              />
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
