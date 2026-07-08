"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { PayInvoiceModal } from "./pay-invoice-modal";
import type { InvoiceView } from "./types";

type InvoiceSummaryCardProps = {
  cardId: string;
  cardName: string;
  invoice: InvoiceView;
  outstandingBalance: string;
};

/** Fatura atual + CTA "Pagar fatura" (docs/22-CREDIT_CARDS.md, "Detalhe do Cartão"). */
export function InvoiceSummaryCard({
  cardId,
  cardName,
  invoice,
  outstandingBalance,
}: InvoiceSummaryCardProps) {
  const [payOpen, setPayOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between",
        CARD_SHADOW_CLASS,
      )}
    >
      <div>
        <p className="text-[13px] font-bold text-muted-foreground">Fatura atual</p>
        <p className="font-mono text-2xl font-semibold text-foreground">
          {formatBRL(invoice.total)}
        </p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {formatDateSaoPaulo(invoice.periodStart)} –{" "}
          {formatDateSaoPaulo(invoice.periodEnd)} · vence{" "}
          {formatDateSaoPaulo(invoice.dueDate)}
        </p>
      </div>

      <Button
        type="button"
        variant="accent"
        onClick={() => setPayOpen(true)}
        disabled={Number(outstandingBalance) <= 0}
        className="shrink-0"
      >
        Pagar fatura
      </Button>

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
