import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

type GoalProgressBarProps = {
  pct: number;
  /** `true` quando `etaMonths` é `null` e a meta ainda não foi atingida (docs da tarefa /goals: "ritmo insuficiente"). */
  insufficientPace: boolean;
  className?: string;
};

/**
 * Barra de progresso da meta (mesmo componente visual de
 * `components/budgets/budget-progress.tsx`, adaptado: aqui não existe
 * "estourou", só completo/incompleto). Largura sempre clampada a 100%; o
 * ícone de alerta reforça "ritmo insuficiente" sem depender só da cor
 * (docs/04-DESIGN_SYSTEM.md, "Color Contrast": "nunca apenas cor").
 */
export function GoalProgressBar({ pct, insufficientPace, className }: GoalProgressBarProps) {
  const width = Math.min(100, Math.max(0, pct));
  const complete = pct >= 100;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            complete ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      {!complete && insufficientPace && (
        <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
      )}
    </div>
  );
}
