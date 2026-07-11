"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { type EntitySelectOption } from "@/components/forms/entity-select";
import { deleteGoalAction } from "@/modules/goals/actions";
import { notifySuccess } from "@/lib/toast";
import { GoalCard } from "./goal-card";
import { GoalFormModal } from "./goal-form-modal";
import type { GoalCardData } from "./types";

type GoalGridProps = {
  goals: GoalCardData[];
  accountOptions: EntitySelectOption[];
  assetOptions: EntitySelectOption[];
};

/**
 * Orquestra `/goals`: grid de cards + criar/editar (FormModal) + excluir
 * (ConfirmDialog). `goals` é a única fonte de verdade (prop vinda do Server
 * Component) — sem cópia local em `useState`; `revalidatePath("/goals")`
 * (dentro das actions) já faz o Next re-renderizar a página com dados
 * frescos após qualquer mutação, mesmo padrão de
 * `components/budgets/budget-grid.tsx`.
 */
export function GoalGrid({ goals, accountOptions, assetOptions }: GoalGridProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalCardData | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<GoalCardData | null>(null);

  function openCreate() {
    setEditingGoal(null);
    setFormOpen(true);
  }

  function openEdit(goal: GoalCardData) {
    setEditingGoal(goal);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingGoal) return;
    const result = await deleteGoalAction(deletingGoal.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Meta excluída");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="accent" size="lg" onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Nova meta
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta criada"
          description="Defina quanto quer guardar e acompanhe o progresso ao longo do tempo."
          actionLabel="+ Criar meta"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onEdit={openEdit} onDelete={setDeletingGoal} />
          ))}
        </div>
      )}

      <GoalFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editingGoal}
        accountOptions={accountOptions}
        assetOptions={assetOptions}
      />

      <ConfirmDialog
        open={Boolean(deletingGoal)}
        onOpenChange={(open) => {
          if (!open) setDeletingGoal(null);
        }}
        title={`Excluir meta "${deletingGoal?.name ?? ""}"?`}
        description="Essa ação não pode ser desfeita."
        onConfirm={handleDelete}
      />
    </div>
  );
}
