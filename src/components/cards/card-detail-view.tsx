"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CreditCard, Pencil, Plus, Receipt, Trash2, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { deleteCardAction } from "@/modules/cards/actions";
import { TransactionType } from "@/generated/prisma/enums";
import { useShell } from "@/components/providers/shell-provider";
import {
  CardLimitProgress,
  computeUsagePercent,
  usageToneForKpi,
  usageToneTextClass,
} from "./card-limit-progress";
import { cardGradient } from "./card-color";
import { CardFace } from "./card-face";
import { CardFormModal } from "./card-form-modal";
import { InvoiceSummaryCard } from "./invoice-summary-card";
import { InvoiceItemsTable } from "./invoice-items-table";
import { InvoiceHistoryList } from "./invoice-history-list";
import type { CardSummaryView, InvoiceView, PastInvoiceView } from "./types";

type CardDetailViewProps = {
  card: CardSummaryView;
  invoice: InvoiceView;
  pastInvoices: PastInvoiceView[];
};

/**
 * Detalhe de `/cards/[id]` (fonte visual: `Personal Finance -
 * Cartoes.dc.html`, seção DETALHE) — hero com a face realista grande +
 * Editar/Excluir à esquerda, título/KPIs/uso/fatura à direita.
 */
export function CardDetailView({ card, invoice, pastInvoices }: CardDetailViewProps) {
  const router = useRouter();
  const { openTransactionModal } = useShell();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const percent = computeUsagePercent(card.outstandingBalance, card.limit);

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="mx-auto flex w-full max-w-[380px] flex-col gap-3 lg:mx-0">
          <CardFace
            gradient={cardGradient(card.color)}
            cardName={card.name}
            brand={card.brand}
            lastFour={card.lastFour}
            holder={card.holderName}
            type={card.type}
          />
          <div className="flex gap-2.5">
            <Button type="button" onClick={() => setEditOpen(true)} className="flex-1 gap-1.5">
              <Pencil className="size-4" aria-hidden="true" />
              Editar cartão
            </Button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              aria-label={`Excluir ${card.name}`}
              className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-foreground sm:text-2xl">{card.name}</h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {card.brand} · final {card.lastFour ?? "----"} · vence dia {card.dueDay}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPICard icon={CreditCard} title="Limite total" value={formatBRL(card.limit)} tone="neutral" />
            <KPICard
              icon={Receipt}
              title="Limite usado"
              value={formatBRL(card.outstandingBalance)}
              tone={usageToneForKpi(percent)}
            />
            <KPICard icon={Wallet} title="Limite disponível" value={formatBRL(card.availableLimit)} tone="success" />
          </div>

          <div className={cn("rounded-xl border border-border bg-card p-[18px]", CARD_SHADOW_CLASS)}>
            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
              <span>Limite utilizado</span>
              <span className={usageToneTextClass(percent)}>{Math.round(percent)}%</span>
            </div>
            <CardLimitProgress percent={percent} className="mt-2.5 h-2.5" />
          </div>

          <InvoiceSummaryCard
            cardId={card.id}
            cardName={card.name}
            invoice={invoice}
            outstandingBalance={card.outstandingBalance}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-foreground">Compras da fatura atual</h3>
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
        <InvoiceItemsTable cardId={card.id} periodStart={invoice.periodStart} periodEnd={invoice.periodEnd} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="text-base font-extrabold text-foreground">Parcelamentos deste cartão</h3>
          <p className="text-sm font-medium text-muted-foreground">
            Compras parceladas da fatura atual aparecem destacadas na tabela acima (&ldquo;Parcela N&rdquo;).
          </p>
        </div>
        <Link
          href={`/installments?cardId=${card.id}`}
          className="inline-flex h-9 shrink-0 items-center rounded-[10px] border border-border bg-transparent px-3.5 text-[13px] font-bold text-muted-foreground transition-colors duration-100 ease-pf-out hover:border-muted-foreground"
        >
          Ver parcelamentos
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-extrabold text-foreground">Histórico de faturas</h3>
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
