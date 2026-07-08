"use client";

import { Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { BudgetProgressBar, budgetStatusTextClass } from "./budget-progress";
import type { BudgetCardData } from "./types";

type BudgetCardProps = {
  budget: BudgetCardData;
  onEdit: (budget: BudgetCardData) => void;
  onDelete: (budget: BudgetCardData) => void;
};

/**
 * Card de orçamento por categoria (docs/26-BUDGETS.md, "Card de Budget"):
 * planejado/gasto em mono, barra de progresso, restante. Mesmo layout de
 * cartão/ação (`components/cards/card-tile.tsx`), sem o link de detalhe —
 * orçamento não tem tela própria de drill-down (docs/26-BUDGETS.md não define
 * uma).
 */
export function BudgetCard({ budget, onEdit, onDelete }: BudgetCardProps) {
  const isOver = budget.status === "OVER";

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[15px] font-extrabold text-foreground">{budget.categoryName}</p>

        <div className="flex shrink-0 gap-1.5">
          <IconActionButton
            icon={Pencil}
            label={`Editar orçamento de ${budget.categoryName}`}
            onClick={() => onEdit(budget)}
          />
          <IconActionButton
            icon={Trash2}
            tone="danger"
            label={`Excluir orçamento de ${budget.categoryName}`}
            onClick={() => onDelete(budget)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-sm font-semibold text-foreground">
            {formatBRL(budget.spentAmount)}{" "}
            <span className="font-sans text-xs font-medium text-muted-foreground">
              / {formatBRL(budget.plannedAmount)}
            </span>
          </p>
          <p className={cn("font-mono text-xs font-semibold", budgetStatusTextClass(budget.status))}>
            {Math.round(budget.progress)}%
          </p>
        </div>
        <BudgetProgressBar progress={budget.progress} status={budget.status} />
      </div>

      <p className="text-xs font-semibold text-muted-foreground">
        {isOver ? "Estourou em " : "Restante: "}
        <span className={cn("font-mono font-semibold", isOver ? "text-destructive" : "text-foreground")}>
          {formatBRL(isOver ? String(Math.abs(Number(budget.remainingAmount))) : budget.remainingAmount)}
        </span>
      </p>
    </div>
  );
}
