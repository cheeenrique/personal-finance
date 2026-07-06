import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BudgetStatus } from "@/modules/budgets/types";

/**
 * Faixas de status já vêm calculadas do backend
 * (`modules/budgets/service.ts`, `statusFromProgress` — docs/26-BUDGETS.md,
 * "Estados Visuais"): Normal até 80% azul/primary, Atenção 80-100%
 * laranja/warning, Estourado >100% vermelho/danger. O frontend só mapeia o
 * enum pra classe visual — nada de recalcular limiar aqui (regra de ouro,
 * docs/99-CLAUDE.md: lógica de negócio só em `modules/`).
 */
const BAR_TONE_CLASSES: Record<BudgetStatus, string> = {
  NORMAL: "bg-primary",
  ATTENTION: "bg-warning",
  OVER: "bg-destructive",
};

const TEXT_TONE_CLASSES: Record<BudgetStatus, string> = {
  NORMAL: "text-primary",
  ATTENTION: "text-warning",
  OVER: "text-destructive",
};

export function budgetStatusTextClass(status: BudgetStatus): string {
  return TEXT_TONE_CLASSES[status];
}

type BudgetProgressBarProps = {
  progress: number;
  status: BudgetStatus;
  className?: string;
};

/**
 * Barra de progresso planejado/gasto do card de orçamento (docs/26-BUDGETS.md,
 * "Card de Budget"). Largura visual sempre clampada a 100% mesmo quando
 * `progress` estoura (ex.: 140%) — o valor real aparece ao lado, em texto, o
 * ícone de alerta reforça o estado sem depender só da cor
 * (design/PERSONAL_FINANCE_DS_HANDOFF.md, "Color Contrast": "nunca apenas cor").
 */
export function BudgetProgressBar({ progress, status, className }: BudgetProgressBarProps) {
  const width = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", BAR_TONE_CLASSES[status])}
          style={{ width: `${width}%` }}
        />
      </div>
      {status !== "NORMAL" && (
        <AlertTriangle className={cn("size-3.5 shrink-0", TEXT_TONE_CLASSES[status])} aria-hidden="true" />
      )}
    </div>
  );
}
