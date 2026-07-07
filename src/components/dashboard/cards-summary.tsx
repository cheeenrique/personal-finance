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

const MAX_VISIBLE_CARDS = 5;

/**
 * Bloco "Cartões e Dívidas" (docs/11-DASHBOARD.md, "3. Cartões e Dívidas"):
 * nome, limite usado/total, barra de progresso — layout de linha única
 * (sem card por item), igual ao demo (design/Personal Finance App.dc.html,
 * "Cartões e dívidas"). Clique vai direto pro detalhe do cartão (`/cards/[id]`).
 *
 * Mostra só os `MAX_VISIBLE_CARDS` mais recentes — `cardService.listWithSummary`
 * ordena por `createdAt` ascendente, então o sort desc + slice acontece aqui
 * (sem tocar no service compartilhado). "Ver cartões" cobre o restante em `/cards`.
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

  const recentCards = [...cards]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_VISIBLE_CARDS);

  return (
    <SectionCard title="Cartões e dívidas" action={{ label: "Ver cartões", href: "/cards" }}>
      <div className="flex flex-col gap-4">
        {recentCards.map((card) => {
          const limit = card.limit.toNumber();
          const outstanding = card.outstandingBalance.toNumber();
          const percent = limit > 0 ? (outstanding / limit) * 100 : 0;

          return (
            <Link key={card.id} href={`/cards/${card.id}`} className="block">
              <div className="mb-[7px] flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-extrabold text-foreground">{card.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatBRL(outstanding)} / {formatBRL(limit)}
                </span>
              </div>

              <ProgressBar
                percent={percent}
                tone={toneForUsage(percent)}
                label={`${formatBRL(outstanding)} / ${formatBRL(limit)}`}
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
