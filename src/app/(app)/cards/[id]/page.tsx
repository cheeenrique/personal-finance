import { notFound } from "next/navigation";

import {
  listCardsAction,
  getInvoiceAction,
  getInvoiceForAction,
  listStoredInvoicesAction,
} from "@/modules/cards/actions";
import { CardType } from "@/generated/prisma/enums";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { CardDetailView } from "@/components/cards/card-detail-view";
import { CardDetailViewMeal } from "@/components/cards/card-detail-view-meal";
import {
  serializeCardSummary,
  serializeInvoice,
  serializePastInvoice,
  serializeStoredInvoice,
} from "@/components/cards/serialize";
import type { PastInvoiceView } from "@/components/cards/types";

const HISTORY_MONTHS = 12;

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

  // MEAL não tem fatura/ciclo (docs/22-CREDIT_CARDS.md não cobre esse tipo) —
  // `getInvoiceAction`/`getInvoiceForAction`/`listStoredInvoicesAction`
  // lançam `CardTypeNotSupportedError` pra esse tipo (ver `modules/cards/service.ts`
  // `assertCreditCard`), então o branch acontece ANTES de qualquer chamada a
  // elas, não depois.
  if (card.type === CardType.MEAL) {
    return <CardDetailViewMeal card={serializeCardSummary(card)} />;
  }

  const invoiceResult = await getInvoiceAction({ cardId: card.id });
  if (!invoiceResult.success) {
    return <p className="text-sm font-medium text-destructive">{invoiceResult.error.message}</p>;
  }

  const invoice = invoiceResult.data;

  /**
   * Histórico: prioriza faturas REAIS armazenadas (`CardInvoice`, extrato
   * importado — docs/22-CREDIT_CARDS.md). Cartão sem nenhuma armazenada cai
   * no fallback CALCULADO por ciclo (`getInvoiceForAction`), comportamento
   * 100% atual — não quebra os cartões que nunca tiveram fatura importada.
   */
  const storedInvoicesResult = await listStoredInvoicesAction(card.id);
  const storedInvoices = storedInvoicesResult.success ? storedInvoicesResult.data : [];

  let pastInvoices: PastInvoiceView[];

  if (storedInvoices.length > 0) {
    pastInvoices = storedInvoices.map(serializeStoredInvoice);
  } else {
    const [closingYear, closingMonth] = toDateInputValueSaoPaulo(invoice.periodEnd).split("-").map(Number);

    const pastInvoiceResults = await Promise.all(
      Array.from({ length: HISTORY_MONTHS }, (_, index) => index + 1).map((monthsBack) => {
        const { year, month } = shiftClosingMonth(closingYear, closingMonth, monthsBack);
        return getInvoiceForAction({ cardId: card.id, year, month });
      }),
    );

    pastInvoices = pastInvoiceResults
      .flatMap((result) => (result.success ? [result.data] : []))
      // Só faturas com movimento — ciclos vazios (sem compras) não viram card.
      // Antes filtrava por `periodEnd > card.createdAt`, mas isso escondia todo o
      // histórico de cartões com lançamentos importados (o cartão nasce "hoje" no
      // app, então toda fatura fechada é anterior ao createdAt).
      .filter((pastInvoice) => Number(pastInvoice.total) > 0)
      .map(serializePastInvoice);
  }

  return (
    <CardDetailView
      card={serializeCardSummary(card)}
      invoice={serializeInvoice(invoice)}
      pastInvoices={pastInvoices}
    />
  );
}
