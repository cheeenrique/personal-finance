import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { HealthScoreInfoButton } from "./health-score-info-button";
import type { HealthScore, ScoreBreakdown, ScoreTone } from "@/modules/insights/types";

type HealthScoreCardProps = {
  healthScore: HealthScore;
};

const SCORE_TEXT_TONE: Record<ScoreTone, string> = {
  success: "text-on-success",
  warning: "text-on-warning",
  danger: "text-on-danger",
};

const SCORE_BAR_TONE: Record<ScoreTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/** `debt`/`savings` são percentuais; `cushion` é meses de reserva (ver `modules/insights/score.ts`). */
function formatBreakdownValue(item: ScoreBreakdown): string {
  return item.key === "cushion" ? `${item.value.toFixed(1)} meses` : `${item.value.toFixed(1)}%`;
}

/**
 * "Saúde financeira" — score 0-100 (`insightsService.healthScore`) com o
 * detalhamento das 3 métricas que o compõem (taxa de poupança,
 * comprometimento com dívida, meses de reserva). `SectionCard` com
 * breakdown em vez de `KPICard` isolado — o usuário precisa entender POR QUÊ
 * o score está naquele nível, não só o número final.
 */
export function HealthScoreCard({ healthScore }: HealthScoreCardProps) {
  return (
    <SectionCard title="Saúde financeira" titleAdornment={<HealthScoreInfoButton />}>
      <div className="flex items-center gap-4">
        <div className="flex shrink-0 flex-col items-center">
          <span className={cn("font-mono text-[32px] font-black leading-none", SCORE_TEXT_TONE[healthScore.tone])}>
            {healthScore.score}
          </span>
          <span className="mt-1 text-[10.5px] font-bold text-muted-foreground">de 100</span>
        </div>

        <div className="flex-1 space-y-2.5">
          {healthScore.breakdown.map((item) => (
            <div key={item.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11.5px] font-semibold">
                <span className="truncate text-muted-foreground">{item.label}</span>
                <span className={cn("shrink-0 font-mono", SCORE_TEXT_TONE[item.tone])}>
                  {formatBreakdownValue(item)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full transition-all", SCORE_BAR_TONE[item.tone])}
                  style={{ width: `${Math.min(Math.max(item.score, 0), 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
