"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { CardLimitProgress, computeUsagePercent, usageToneTextClass } from "./card-limit-progress";
import { cardTintClass } from "./card-color";
import { CARD_ICON_MAP, DEFAULT_CARD_ICON } from "./card-icon";
import type { CardSummaryView } from "./types";

type CardTileProps = {
  card: CardSummaryView;
  onEdit: (card: CardSummaryView) => void;
  onDelete: (card: CardSummaryView) => void;
};

/**
 * Tile de cartão na grid de `/cards` (docs/22-CREDIT_CARDS.md, "Exemplo de
 * Card UI"). O card inteiro é clicável (leva ao detalhe) via link
 * "esticado" (`absolute inset-0`) por trás do conteúdo — os botões de
 * ação ficam por cima (`z-10`), então recebem o clique antes do link,
 * evitando aninhar `<button>` dentro de `<a>` (inválido/inacessível).
 */
export function CardTile({ card, onEdit, onDelete }: CardTileProps) {
  const percent = computeUsagePercent(card.outstandingBalance, card.limit);
  const Icon = (card.icon && CARD_ICON_MAP[card.icon]) || DEFAULT_CARD_ICON;

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5",
        CARD_SHADOW_CLASS,
      )}
    >
      <Link
        href={`/cards/${card.id}`}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`Ver detalhes de ${card.name}`}
      />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
              cardTintClass(card.color),
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold text-foreground">{card.name}</p>
            <p className="truncate text-xs font-semibold text-muted-foreground">{card.brand}</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <IconActionButton
            icon={Pencil}
            label={`Editar ${card.name}`}
            onClick={(event) => {
              event.preventDefault();
              onEdit(card);
            }}
          />
          <IconActionButton
            icon={Trash2}
            tone="danger"
            label={`Excluir ${card.name}`}
            onClick={(event) => {
              event.preventDefault();
              onDelete(card);
            }}
          />
        </div>
      </div>

      <div className="relative z-10 space-y-1.5">
        <CardLimitProgress percent={percent} />
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-sm font-bold text-foreground">
            {formatBRL(card.outstandingBalance)}{" "}
            <span className="font-sans text-xs font-medium text-muted-foreground">
              / {formatBRL(card.limit)}
            </span>
          </p>
          <p className={cn("font-mono text-xs font-bold", usageToneTextClass(percent))}>
            {Math.round(percent)}%
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-border pt-3 text-xs">
        <div>
          <p className="font-semibold text-muted-foreground">Fatura atual</p>
          <p className="font-mono font-bold text-foreground">{formatBRL(card.currentInvoiceTotal)}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-muted-foreground">Disponível</p>
          <p className="font-mono font-bold text-success">{formatBRL(card.availableLimit)}</p>
        </div>
      </div>

      <p className="relative z-10 text-[11px] font-medium text-muted-foreground">
        Vencimento: {formatDateSaoPaulo(card.invoiceDueDate)}
      </p>
    </div>
  );
}
