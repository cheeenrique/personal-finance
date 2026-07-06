import { notFound } from "next/navigation";

import { listCardsAction, getInvoiceAction, getInvoiceForAction } from "@/modules/cards/actions";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { CardDetailView } from "@/components/cards/card-detail-view";
import { serializeCardSummary, serializeInvoice, serializePastInvoice } from "@/components/cards/serialize";

const HISTORY_MONTHS = 3;

/** Mês/ano do fechamento `monthsBack` ciclos antes de `year`/`month` (1-12), com rollover de ano. */
function shiftClosingMonth(year: number, month: number, monthsBack: number): { year: number; month: number } {
  const zeroBasedTotal = year * 12 + (month - 1) - monthsBack;
  return {
    year: Math.floor(zeroBasedTotal / 12),
    month: (((zeroBasedTotal % 12) + 12) % 12) + 1,
  };
}

type CardDetailPageProps = {
  params: Promise<{ id: string }>;
};

/** Detalhe do cartão (docs/22-CREDIT_CARDS.md, "Detalhe do Cartão"). */
export default async function CardDetailPage({ params }: CardDetailPageProps) {
  const { id } = await params;

  const listResult = await listCardsAction();
  if (!listResult.success) {
    return <p className="text-sm font-medium text-destructive">{listResult.error.message}</p>;
  }

  const card = listResult.data.find((item) => item.id === id);
  if (!card) notFound();

  const invoiceResult = await getInvoiceAction({ cardId: card.id });
  if (!invoiceResult.success) {
    return <p className="text-sm font-medium text-destructive">{invoiceResult.error.message}</p>;
  }

  const invoice = invoiceResult.data;
  const [closingYear, closingMonth] = toDateInputValueSaoPaulo(invoice.periodEnd).split("-").map(Number);

  const pastInvoiceResults = await Promise.all(
    Array.from({ length: HISTORY_MONTHS }, (_, index) => index + 1).map((monthsBack) => {
      const { year, month } = shiftClosingMonth(closingYear, closingMonth, monthsBack);
      return getInvoiceForAction({ cardId: card.id, year, month });
    }),
  );

  const pastInvoices = pastInvoiceResults
    .flatMap((result) => (result.success ? [result.data] : []))
    // Ignora ciclos fechados antes do cartão existir (docs/22 não define isso — evita fatura "fantasma").
    .filter((pastInvoice) => pastInvoice.periodEnd > card.createdAt)
    .map(serializePastInvoice);

  return (
    <CardDetailView
      card={serializeCardSummary(card)}
      invoice={serializeInvoice(invoice)}
      pastInvoices={pastInvoices}
    />
  );
}
