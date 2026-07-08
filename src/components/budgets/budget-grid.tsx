"use client";

import { useState } from "react";
import { Plus, PiggyBank } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteBudgetAction } from "@/modules/budgets/actions";
import { notifySuccess } from "@/lib/toast";
import { PeriodSelector } from "./period-selector";
import { BudgetCard } from "./budget-card";
import { BudgetFormModal } from "./budget-form-modal";
import type { BudgetCardData } from "./types";

type BudgetGridProps = {
  budgets: BudgetCardData[];
  month: number;
  year: number;
};

/**
 * Orquestra `/budgets` (docs/26-BUDGETS.md): seletor de período + grid de
 * cards + criar/editar (FormModal) + excluir (ConfirmDialog). `budgets` é a
 * única fonte de verdade (prop vinda do Server Component) — sem cópia local
 * em `useState`; `revalidatePath("/budgets")` (dentro das actions) já faz o
 * Next re-renderizar a página com dados frescos após qualquer mutação, mesmo
 * padrão de `components/cards/cards-grid.tsx`.
 */
export function BudgetGrid({ budgets, month, year }: BudgetGridProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetCardData | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<BudgetCardData | null>(null);

  function openCreate() {
    setEditingBudget(null);
    setFormOpen(true);
  }

  function openEdit(budget: BudgetCardData) {
    setEditingBudget(budget);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingBudget) return;
    const result = await deleteBudgetAction(deletingBudget.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Orçamento excluído");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector month={month} year={year} />

        <Button type="button" variant="accent" size="lg" onClick={openCreate} className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          Novo orçamento
        </Button>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Nenhum orçamento criado"
          description="Defina quanto pode gastar por categoria neste período para acompanhar o progresso."
          actionLabel="+ Criar orçamento"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {budgets.map((budget) => (
            <BudgetCard key={budget.id} budget={budget} onEdit={openEdit} onDelete={setDeletingBudget} />
          ))}
        </div>
      )}

      <BudgetFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        budget={editingBudget}
        defaultMonth={month}
        defaultYear={year}
      />

      <ConfirmDialog
        open={Boolean(deletingBudget)}
        onOpenChange={(open) => {
          if (!open) setDeletingBudget(null);
        }}
        title={`Excluir orçamento de ${deletingBudget?.categoryName ?? ""}?`}
        description="Essa ação não pode ser desfeita. As transações já lançadas nesta categoria continuam existindo normalmente."
        onConfirm={handleDelete}
      />
    </div>
  );
}
