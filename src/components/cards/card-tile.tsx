"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { formatBRL } from "@/lib/money/format";
import { formatDateShortSaoPaulo } from "@/lib/date/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { CardType } from "@/generated/prisma/enums";
import { CardLimitProgress, computeUsagePercent, usageToneTextClass } from "./card-limit-progress";
import { cardGradient } from "./card-color";
import { CardFace } from "./card-face";
import { CardStatusStamp, getCardStatusMeta } from "./card-status";
import type { CardSummaryView } from "./types";

type CardTileProps = {
  card: CardSummaryView;
  onEdit: (card: CardSummaryView) => void;
  onDelete: (card: CardSummaryView) => void;
};

type InvoiceStatusBadge = { label: string; className: string; icon?: LucideIcon; dueDate: string };

/**
 * Faixa "vence {data} + status" do tile (docs/superpowers/specs/
 * 2026-07-13-cartao-vencimento-fatura-status-design.md) — só CREDIT e só
 * quando existe uma fatura fechada aplicável (`lastInvoiceDueDate !== null`;
 * `null` cobre MEAL, cartão sem fatura anterior E fatura com `total=0`, ver
 * `modules/cards/service.ts` `computeLastInvoiceFields`). Tom por prioridade:
 * atrasada (destructive) > paga (success) > em aberto (warning) — nunca
 * vermelho hardcoded, sempre os tokens do design system
 * (docs/04-DESIGN_SYSTEM.md, "Regra on-* vs. base").
 */
function resolveInvoiceStatusBadge(card: CardSummaryView): InvoiceStatusBadge | null {
  if (card.type !== CardType.CREDIT) return null;
  if (card.lastInvoiceDueDate === null || card.lastInvoiceIsPaid === null || card.lastInvoiceIsOverdue === null) {
    return null;
  }

  const dueDate = card.lastInvoiceDueDate;

  if (card.lastInvoiceIsOverdue) {
    return { label: "Fatura atrasada", className: "bg-destructive/16 text-on-danger", icon: AlertTriangle, dueDate };
  }
  if (card.lastInvoiceIsPaid) {
    return { label: "Paga", className: "bg-success/16 text-success", dueDate };
  }
  return { label: "Em aberto", className: "bg-warning/14 text-on-warning", dueDate };
}

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
  const invoiceStatusBadge = resolveInvoiceStatusBadge(card);
  const InvoiceStatusIcon = invoiceStatusBadge?.icon;
  const statusMeta = getCardStatusMeta(card.status);

  return (
    <div className="flex flex-col gap-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <div className="relative">
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
            className={statusMeta?.faceFilterClass}
          />
        </Link>
        {statusMeta && <CardStatusStamp meta={statusMeta} />}
      </div>

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

        {invoiceStatusBadge && (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-[11px] font-semibold text-muted-foreground">
              vence {formatDateShortSaoPaulo(invoiceStatusBadge.dueDate)}
            </p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
                invoiceStatusBadge.className,
              )}
            >
              {InvoiceStatusIcon && <InvoiceStatusIcon className="size-3" aria-hidden="true" />}
              {invoiceStatusBadge.label}
            </span>
          </div>
        )}

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
