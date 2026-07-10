"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cardGradient } from "./card-color";
import { CardFace } from "./card-face";
import type { CardSummaryView } from "./types";

type CardDetailFacePanelProps = {
  card: CardSummaryView;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Coluna esquerda do hero de `/cards/[id]` — face realista grande (~380px) +
 * Editar/Excluir (fonte visual: `Personal Finance - Cartoes.dc.html`, seção
 * DETALHE, `sel.edit`/botão excluir). Idêntica entre CREDIT
 * (`card-detail-view.tsx`) e MEAL (`card-detail-view-meal.tsx`, que ganha o
 * mesmo hero nesta task) — extraída pra reuso. `CardFace` já resolve o selo
 * "Crédito"/"Alimentação" internamente (`TYPE_LABEL`), sem precisar de nada
 * extra aqui pro caso MEAL.
 */
export function CardDetailFacePanel({ card, onEdit, onDelete }: CardDetailFacePanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-[380px] flex-col gap-3 lg:mx-0">
      <CardFace
        gradient={cardGradient(card.color)}
        cardName={card.name}
        brand={card.brand}
        lastFour={card.lastFour}
        holder={card.holderName}
        expiry={card.expiry}
        type={card.type}
      />
      <div className="flex gap-2.5">
        <Button type="button" size="lg" onClick={onEdit} className="flex-1 gap-1.5">
          <Pencil className="size-4" aria-hidden="true" />
          Editar cartão
        </Button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Excluir ${card.name}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
