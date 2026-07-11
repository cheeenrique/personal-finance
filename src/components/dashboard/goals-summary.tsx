import Link from "next/link";
import { Target } from "lucide-react";

import type { GoalProgress } from "@/modules/goals/types";
import { SectionCard } from "./section-card";
import { ProgressBar } from "./progress-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";

type GoalsSummaryProps = {
  goals: GoalProgress[];
};

const MAX_VISIBLE_GOALS = 5;

/** "meta atingida" cobre `pct>=100` (saturado, ver `modules/goals/types.ts`) e `etaMonths===0`; "ritmo insuficiente" é o único caso de `etaMonths===null`. */
function etaLabel(progress: GoalProgress): string {
  if (progress.pct >= 100 || progress.etaMonths === 0) return "meta atingida";
  if (progress.etaMonths === null) return "ritmo insuficiente";
  return `~${progress.etaMonths} ${progress.etaMonths === 1 ? "mês" : "meses"}`;
}

/** Sem ritmo calculável = precisa de atenção (`warning`); resto segue o tom neutro já usado em Empréstimos/Parcelamentos (mesma barra, sem 3-tons de risco como em Cartões). */
function toneForGoal(progress: GoalProgress): "neutral" | "warning" {
  return progress.pct < 100 && progress.etaMonths === null ? "warning" : "neutral";
}

/**
 * Bloco "Metas" do Dashboard — 1 linha por meta com progresso
 * (`goalService.listWithProgress`), mesmo padrão visual de
 * `CardsSummary`/`InstallmentsSummary`/`LoansSummary`. Clique não abre nada
 * aqui (sem detalhe de meta individual ainda) — "Ver metas" cobre a lista
 * completa em `/goals`.
 */
export function GoalsSummary({ goals }: GoalsSummaryProps) {
  if (goals.length === 0) {
    return (
      <SectionCard title="Metas">
        <EmptyState
          icon={Target}
          title="Nenhuma meta cadastrada"
          description="Crie uma meta de economia para acompanhar o progresso aqui."
          className="min-h-0 border-none py-2"
        />
        <Link href="/goals" className={buttonVariants({ variant: "accent", className: "mt-3 w-full" })}>
          Nova meta
        </Link>
      </SectionCard>
    );
  }

  const visibleGoals = goals.slice(0, MAX_VISIBLE_GOALS);

  return (
    <SectionCard title="Metas" action={{ label: "Ver metas", href: "/goals" }}>
      <div className="flex flex-col gap-4">
        {visibleGoals.map((progress) => (
          <div key={progress.goal.id}>
            <div className="mb-[7px] flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-extrabold text-foreground">{progress.goal.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatBRL(progress.current)} / {formatBRL(progress.target)}
              </span>
            </div>

            <ProgressBar
              percent={progress.pct}
              tone={toneForGoal(progress)}
              label={etaLabel(progress)}
              showLabel={false}
              className="space-y-0"
            />
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{etaLabel(progress)}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
