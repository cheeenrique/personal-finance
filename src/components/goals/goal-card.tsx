"use client";

import { Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { GoalProgressBar } from "./goal-progress-bar";
import type { GoalCardData } from "./types";

type GoalCardProps = {
  goal: GoalCardData;
  onEdit: (goal: GoalCardData) => void;
  onDelete: (goal: GoalCardData) => void;
};

/**
 * Texto de prazo estimado (docs da tarefa /goals): meta atingida > ritmo
 * insuficiente > "~N meses" — puramente apresentação, `pct`/`etaMonths` já
 * vêm calculados do `goalService.listWithProgress` (regra de ouro,
 * docs/99-CLAUDE.md: lógica de negócio só em `modules/`).
 */
function formatEta(pct: number, etaMonths: number | null): string {
  if (pct >= 100) return "Meta atingida";
  if (etaMonths === null) return "Ritmo insuficiente";
  return `~${etaMonths} ${etaMonths === 1 ? "mês" : "meses"}`;
}

/**
 * Card de meta de poupança. Mesmo layout de cartão/ação de
 * `components/budgets/budget-card.tsx` (edição/exclusão direto no card, sem
 * link de detalhe) — meta não tem tela própria de drill-down, mesma decisão
 * de orçamento (`modules/goals/service.ts`: "meta é só leitura sobre
 * conta/ativo").
 */
export function GoalCard({ goal, onEdit, onDelete }: GoalCardProps) {
  const complete = goal.pct >= 100;
  const insufficientPace = !complete && goal.etaMonths === null;

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[15px] font-extrabold text-foreground">{goal.name}</p>

        <div className="flex shrink-0 gap-1.5">
          <IconActionButton icon={Pencil} label={`Editar meta de ${goal.name}`} onClick={() => onEdit(goal)} />
          <IconActionButton
            icon={Trash2}
            tone="danger"
            label={`Excluir meta de ${goal.name}`}
            onClick={() => onDelete(goal)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-sm font-semibold text-foreground">
            {formatBRL(goal.current)}{" "}
            <span className="font-sans text-xs font-medium text-muted-foreground">/ {formatBRL(goal.target)}</span>
          </p>
          <p className={cn("font-mono text-xs font-semibold", complete ? "text-success" : "text-primary")}>
            {Math.round(goal.pct)}%
          </p>
        </div>
        <GoalProgressBar pct={goal.pct} insufficientPace={insufficientPace} />
      </div>

      <p className={cn("text-xs font-semibold", insufficientPace ? "text-warning" : "text-muted-foreground")}>
        {formatEta(goal.pct, goal.etaMonths)}
      </p>
    </div>
  );
}
