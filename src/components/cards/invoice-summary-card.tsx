"use client";

import { useState } from "react";
import { Clock, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { PayInvoiceModal } from "./pay-invoice-modal";
import type { InvoiceView } from "./types";

type InvoiceSummaryCardProps = {
  cardId: string;
  cardName: string;
  invoice: InvoiceView;
  outstandingBalance: string;
  /** Dia de fechamento/vencimento (`CardSummaryView.closingDay`/`dueDay`) — dia fixo do ciclo, não a data ISO de `invoice` (fonte visual: `Personal Finance - Cartoes.dc.html`, "fecha dia {{ sel.closingDay }}"/"vence dia {{ sel.dueDay }}"). */
  closingDay: number;
  dueDay: number;
};

/** Faixa "fatura atual" + CTA "Pagar fatura" (docs/22-CREDIT_CARDS.md, "Detalhe do Cartão") — tile de ícone (Receipt, tint accent) + chip "vence dia Y" (ícone relógio, tint warning), mesmo padrão dos demais KPIs/faixas do detalhe. */
export function InvoiceSummaryCard({
  cardId,
  cardName,
  invoice,
  outstandingBalance,
  closingDay,
  dueDay,
}: InvoiceSummaryCardProps) {
  const [payOpen, setPayOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3.5 rounded-xl border border-border bg-card p-[18px]",
        CARD_SHADOW_CLASS,
      )}
    >
      <div className="flex items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-accent/16 text-accent">
          <Receipt className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold text-muted-foreground">Fatura atual · fecha dia {closingDay}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-foreground">{formatBRL(invoice.total)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-warning/14 px-3 text-xs font-extrabold text-on-warning">
          <Clock className="size-[13px]" aria-hidden="true" />
          vence dia {dueDay}
        </span>
        <Button
          type="button"
          variant="accent"
          onClick={() => setPayOpen(true)}
          disabled={Number(outstandingBalance) <= 0}
          className="shrink-0"
        >
          Pagar fatura
        </Button>
      </div>

      <PayInvoiceModal
        open={payOpen}
        onOpenChange={setPayOpen}
        cardId={cardId}
        cardName={cardName}
        invoiceTotal={invoice.total}
        outstandingBalance={outstandingBalance}
      />
    </div>
  );
}
