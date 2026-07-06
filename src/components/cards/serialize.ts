import type { CardWithSummary, Invoice } from "@/modules/cards/types";
import type { CardSummaryView, InvoiceView, PastInvoiceView } from "./types";

/** Server-only, sem "use server": só roda dentro de Server Components (páginas), nunca cruza a fronteira do client sozinha. */

export function serializeCardSummary(card: CardWithSummary): CardSummaryView {
  return {
    id: card.id,
    name: card.name,
    brand: card.brand,
    limit: card.limit.toString(),
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    color: card.color,
    icon: card.icon,
    isActive: card.isActive,
    createdAt: card.createdAt.toISOString(),
    currentInvoiceTotal: card.currentInvoiceTotal.toString(),
    outstandingBalance: card.outstandingBalance.toString(),
    availableLimit: card.availableLimit.toString(),
    invoiceDueDate: card.invoiceDueDate.toISOString(),
  };
}

export function serializeInvoice(invoice: Invoice): InvoiceView {
  return {
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    total: invoice.total.toString(),
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      amount: item.amount.toString(),
      date: item.date.toISOString(),
      installmentNumber: item.installmentNumber,
      installmentPurchaseId: item.installmentPurchaseId,
    })),
  };
}

export function serializePastInvoice(invoice: Invoice): PastInvoiceView {
  return {
    periodEnd: invoice.periodEnd.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    total: invoice.total.toString(),
  };
}
