"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { CardType } from "@/generated/prisma/enums";
import { CardLimitProgress, computeUsagePercent, usageToneTextClass } from "./card-limit-progress";
import { cardGradient } from "./card-color";
import { CardFace } from "./card-face";
import type { CardSummaryView } from "./types";

type CardTileProps = {
  card: CardSummaryView;
  onEdit: (card: CardSummaryView) => void;
  onDelete: (card: CardSummaryView) => void;
};

/**
 * Tile de cartão na grid de `/cards` (fonte visual: `Personal Finance -
 * Cartoes.dc.html`, seção GRID) — face realista clicável (leva ao detalhe,
 * `Link` nativo, sem `<button>` aninhado) + card de meta com barra de uso,
 * valores e ações Editar/Excluir logo abaixo.
 */
export function CardTile({ card, onEdit, onDelete }: CardTileProps) {
  const isMeal = card.type === CardType.MEAL;
  const percent = isMeal
    ? computeUsagePercent(card.mealSpent ?? "0", card.mealRecharged ?? "0")
    : computeUsagePercent(card.outstandingBalance, card.limit);
  const usedValue = isMeal ? (card.mealSpent ?? "0") : card.outstandingBalance;
  const totalValue = isMeal ? (card.mealRecharged ?? "0") : card.limit;
  const footerLeftLabel = isMeal ? "Recarregado" : "Fatura atual";
  const footerLeftValue = isMeal ? (card.mealRecharged ?? "0") : card.currentInvoiceTotal;
  const footerRightLabel = isMeal ? "Saldo" : "Disponível";
  const footerRightValue = isMeal ? (card.mealBalance ?? "0") : card.availableLimit;

  return (
    <div className="flex flex-col gap-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <Link
        href={`/cards/${card.id}`}
        aria-label={`Ver detalhes de ${card.name}`}
        className="block rounded-xl transition-transform duration-150 ease-out hover:-translate-y-1"
      >
        <CardFace
          gradient={cardGradient(card.color)}
          cardName={card.name}
          brand={card.brand}
          lastFour={card.lastFour}
          holder={card.holderName}
          expiry={card.expiry}
          type={card.type}
        />
      </Link>

      <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", CARD_SHADOW_CLASS)}>
        <div className="space-y-1.5">
          <CardLimitProgress percent={percent} />
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-[13px] font-semibold text-foreground">
              {formatBRL(usedValue)}{" "}
              <span className="font-sans text-xs font-medium text-muted-foreground">
                de {formatBRL(totalValue)}
              </span>
            </p>
            <p className={cn("shrink-0 font-mono text-xs font-semibold", usageToneTextClass(percent))}>
              {Math.round(percent)}%
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground">{footerLeftLabel}</p>
            <p className="truncate font-mono text-[13px] font-semibold text-foreground">
              {formatBRL(footerLeftValue)}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[11px] font-semibold text-muted-foreground">{footerRightLabel}</p>
            <p className="truncate font-mono text-[13px] font-semibold text-success">
              {formatBRL(footerRightValue)}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <IconActionButton icon={Pencil} label={`Editar ${card.name}`} onClick={() => onEdit(card)} />
            <IconActionButton
              icon={Trash2}
              tone="danger"
              label={`Excluir ${card.name}`}
              onClick={() => onDelete(card)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
