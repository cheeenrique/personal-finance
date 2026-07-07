import { calendarPartsSP, startOfDaySP } from "@/lib/date/calendar-sp";
import type { CardWithSummary, CardInvoice, Invoice } from "@/modules/cards/types";
import type { CardSummaryView, InvoiceView, PastInvoiceView } from "./types";

/** Server-only, sem "use server": só roda dentro de Server Components (páginas), nunca cruza a fronteira do client sozinha. */

export function serializeCardSummary(card: CardWithSummary): CardSummaryView {
  return {
    id: card.id,
    name: card.name,
    brand: card.brand,
    type: card.type,
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
    mealBalance: card.mealBalance ? card.mealBalance.toString() : null,
    mealRecharged: card.mealRecharged ? card.mealRecharged.toString() : null,
    mealSpent: card.mealSpent ? card.mealSpent.toString() : null,
  };
}

/**
 * `invoice.items` (módulo, insumo do cálculo de `total` em
 * `cardService.buildInvoice`) não entra na `InvoiceView` — o detalhe do
 * cartão busca as compras da fatura direto via `listTransactionsAction`
 * (`InvoiceItemsTable`/`use-invoice-items-list.ts`), com paginação
 * server-side, em vez de receber a lista inteira como prop do Server
 * Component.
 */
export function serializeInvoice(invoice: Invoice): InvoiceView {
  return {
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    total: invoice.total.toString(),
  };
}

/** Meia-noite de hoje em America/Sao_Paulo — mesmo instante usado pra construir `dueDate` (`modules/cards/cycle.ts`). */
function startOfTodaySP(): Date {
  const { year, month, day } = calendarPartsSP(new Date());
  return startOfDaySP(year, month, day);
}

/**
 * Fatura CALCULADA por ciclo (`cardService.invoiceFor`) — fallback pro
 * histórico de cartões sem `CardInvoice` armazenada (docs/22-CREDIT_CARDS.md,
 * ver page.tsx). Sem `isPaid` próprio (é derivada, não uma fatura real
 * lançada) — usa a heurística "vencimento já no passado = paga", já que o
 * dono não guarda pagamento explícito de fatura calculada.
 */
export function serializePastInvoice(invoice: Invoice): PastInvoiceView {
  const { year, month } = calendarPartsSP(invoice.periodEnd);
  return {
    year,
    month,
    dueDate: invoice.dueDate.toISOString(),
    total: invoice.total.toString(),
    isPaid: invoice.dueDate < startOfTodaySP(),
  };
}

/**
 * Fatura REAL fechada, armazenada (`CardInvoice`) — histórico verdadeiro pra
 * cartões com extrato importado (docs/22-CREDIT_CARDS.md, "Lógica de
 * Fatura"). `isPaid` vem direto do banco, não é heurística.
 */
export function serializeStoredInvoice(invoice: CardInvoice): PastInvoiceView {
  return {
    year: invoice.year,
    month: invoice.month,
    dueDate: invoice.dueDate.toISOString(),
    total: invoice.total.toString(),
    isPaid: invoice.isPaid,
  };
}
