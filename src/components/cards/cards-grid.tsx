"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteCardAction } from "@/modules/cards/actions";
import { notifySuccess } from "@/lib/toast";
import { CardTile } from "./card-tile";
import { NewCardTile } from "./new-card-tile";
import { CardFormModal } from "./card-form-modal";
import type { CardSummaryView } from "./types";

type CardsGridProps = {
  cards: CardSummaryView[];
  loadError: string | null;
};

/**
 * Orquestra a grid de `/cards` (docs/22-CREDIT_CARDS.md, "Cards na
 * listagem"): grid + criar/editar (FormModal) + excluir (ConfirmDialog).
 * `cards` é a única fonte de verdade (prop vinda do Server Component) — sem
 * cópia local em `useState`; `revalidatePath("/cards")` (dentro das actions)
 * já faz o Next re-renderizar a página com dados frescos após qualquer
 * mutação.
 */
export function CardsGrid({ cards, loadError }: CardsGridProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardSummaryView | null>(null);
  const [deletingCard, setDeletingCard] = useState<CardSummaryView | null>(null);

  function openCreate() {
    setEditingCard(null);
    setFormOpen(true);
  }

  function openEdit(card: CardSummaryView) {
    setEditingCard(card);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingCard) return;
    const result = await deleteCardAction(deletingCard.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Cartão excluído");
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-8 text-center text-sm font-medium text-destructive">
        {loadError}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <>
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão cadastrado"
          description="Cadastre seu primeiro cartão para acompanhar limite, fatura e compras."
          actionLabel="+ Novo Cartão"
          onAction={openCreate}
        />
        <CardFormModal open={formOpen} onOpenChange={setFormOpen} card={null} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 sm:grid-cols-2">
        {cards.map((card) => (
          <CardTile key={card.id} card={card} onEdit={openEdit} onDelete={setDeletingCard} />
        ))}
        <NewCardTile onClick={openCreate} />
      </div>

      <CardFormModal open={formOpen} onOpenChange={setFormOpen} card={editingCard} />

      <ConfirmDialog
        open={Boolean(deletingCard)}
        onOpenChange={(open) => {
          if (!open) setDeletingCard(null);
        }}
        title={`Excluir ${deletingCard?.name ?? "cartão"}?`}
        description="Essa ação não pode ser desfeita. As transações já lançadas neste cartão continuam existindo, mas ele some da listagem."
        onConfirm={handleDelete}
      />
    </div>
  );
}
