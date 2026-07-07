"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CreditCard, Pencil, Receipt, Trash2, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deleteCardAction } from "@/modules/cards/actions";
import {
  CardLimitProgress,
  computeUsagePercent,
  usageToneForKpi,
} from "./card-limit-progress";
import { cardTintClass } from "./card-color";
import { CARD_ICON_MAP, DEFAULT_CARD_ICON } from "./card-icon";
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

/** Composição do detalhe de `/cards/[id]` (docs/22-CREDIT_CARDS.md, "Detalhe do Cartão"). */
export function CardDetailView({ card, invoice, pastInvoices }: CardDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const percent = computeUsagePercent(card.outstandingBalance, card.limit);
  const Icon = (card.icon && CARD_ICON_MAP[card.icon]) || DEFAULT_CARD_ICON;

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

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-[12px]",
              cardTintClass(card.color),
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-foreground">{card.name}</h2>
            <p className="truncate text-sm font-medium text-muted-foreground">{card.brand}</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={`Editar ${card.name}`}
            className="flex size-9 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            aria-label={`Excluir ${card.name}`}
            className="flex size-9 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
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

      <CardLimitProgress percent={percent} className="h-2.5" />

      <InvoiceSummaryCard
        cardId={card.id}
        cardName={card.name}
        invoice={invoice}
        outstandingBalance={card.outstandingBalance}
      />

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-extrabold text-foreground">Compras da fatura atual</h3>
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
          href="/installments"
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
