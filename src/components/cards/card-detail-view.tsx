"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Clock, CreditCard, Layers3, Plus, Receipt, ShoppingBag, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { deleteCardAction } from "@/modules/cards/actions";
import { TransactionType } from "@/generated/prisma/enums";
import { useShell } from "@/components/providers/shell-provider";
import { CardLimitProgress, computeUsagePercent, usageToneTextClass } from "./card-limit-progress";
import { CardDetailFacePanel } from "./card-detail-face-panel";
import { CardFormModal } from "./card-form-modal";
import { InvoiceSummaryCard } from "./invoice-summary-card";
import { InvoiceItemsTable } from "./invoice-items-table";
import { InvoiceHistoryList } from "./invoice-history-list";
import { CardPeriodFilterBar } from "./card-period-filter-bar";
import { useCardPeriodFilter } from "./use-card-period-filter";
import type { CardSummaryView, InvoiceView, PastInvoiceView } from "./types";

type CardDetailViewProps = {
  card: CardSummaryView;
  invoice: InvoiceView;
  pastInvoices: PastInvoiceView[];
};

/**
 * Detalhe de `/cards/[id]` pra cartão CREDIT (fonte visual: `Personal
 * Finance - Cartoes.dc.html`, seção DETALHE) — hero com a face realista
 * grande + Editar/Excluir à esquerda, título/KPIs/uso/fatura à direita;
 * compras da fatura com filtro de período segmentado; faixa de
 * parcelamentos; histórico de faturas.
 */
export function CardDetailView({ card, invoice, pastInvoices }: CardDetailViewProps) {
  const router = useRouter();
  const { openTransactionModal } = useShell();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const percent = computeUsagePercent(card.outstandingBalance, card.limit);
  const periodFilter = useCardPeriodFilter();

  async function handleDelete() {
    const result = await deleteCardAction(card.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Cartão excluído");
    router.push("/cards");
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/cards"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Cartões
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        <CardDetailFacePanel card={card} onEdit={() => setEditOpen(true)} onDelete={() => setDeleteOpen(true)} />

        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-foreground sm:text-2xl">{card.name}</h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {card.brand} · final {card.lastFour ?? "----"} · vence dia {card.dueDay}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPICard icon={CreditCard} title="Limite total" value={formatBRL(card.limit)} tone="neutral" />
            <KPICard icon={Receipt} title="Limite usado" value={formatBRL(card.outstandingBalance)} tone="warning" />
            <KPICard icon={Wallet} title="Disponível" value={formatBRL(card.availableLimit)} tone="success" />
          </div>

          <div className={cn("rounded-xl border border-border bg-card p-[18px]", CARD_SHADOW_CLASS)}>
            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
              <span>Limite utilizado</span>
              <span className={usageToneTextClass(percent)}>{Math.round(percent)}%</span>
            </div>
            <CardLimitProgress percent={percent} className="mt-2.5 h-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500" />
          </div>

          <InvoiceSummaryCard
            cardId={card.id}
            cardName={card.name}
            invoice={invoice}
            outstandingBalance={card.outstandingBalance}
            closingDay={card.closingDay}
            dueDay={card.dueDay}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-2 text-base font-extrabold text-foreground">
            <ShoppingBag className="size-[17px] text-muted-foreground" aria-hidden="true" />
            Compras da fatura atual
          </h3>
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => openTransactionModal(TransactionType.EXPENSE, card.id)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Compra
          </Button>
        </div>

        <InvoiceItemsTable
          cardId={card.id}
          dateFrom={periodFilter.range.dateFrom}
          dateTo={periodFilter.range.dateTo}
          periodFilter={
            <CardPeriodFilterBar
              mode={periodFilter.mode}
              setMode={periodFilter.setMode}
              customFrom={periodFilter.customFrom}
              setCustomFrom={periodFilter.setCustomFrom}
              customTo={periodFilter.customTo}
              setCustomTo={periodFilter.setCustomTo}
              idPrefix="card-invoice-period"
            />
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="inline-flex items-center gap-2 text-base font-extrabold text-foreground">
            <Layers3 className="size-[17px] text-accent" aria-hidden="true" />
            Parcelamentos deste cartão
          </h3>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Acompanhe aqui todas as compras que você dividiu em parcelas neste cartão — com o progresso de cada uma.
          </p>
        </div>
        <Link
          href={`/installments?cardId=${card.id}`}
          className={cn(buttonVariants({ variant: "neutral" }), "shrink-0")}
        >
          Ver parcelamentos
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="inline-flex items-center gap-2 text-base font-extrabold text-foreground">
          <Clock className="size-[17px] text-muted-foreground" aria-hidden="true" />
          Histórico de faturas
        </h3>
        <InvoiceHistoryList invoices={pastInvoices} />
      </div>

      <CardFormModal open={editOpen} onOpenChange={setEditOpen} card={card} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir ${card.name}?`}
        description="Essa ação não pode ser desfeita. As transações já lançadas neste cartão continuam existindo, mas ele some da listagem."
        onConfirm={handleDelete}
      />
    </div>
  );
}
