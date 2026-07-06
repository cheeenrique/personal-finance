import { Prisma, type Card } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { cardRepository, type CreateCardData, type UpdateCardData, type InvoiceItemRow } from "./repository";
import { cycleContaining, cycleForClosingMonth, type CardCycle } from "./cycle";
import { CardNotFoundError } from "./errors";
import type { CardWithSummary, Invoice, Money } from "./types";

/** Client Prisma padrão ou escopado a uma `$transaction` interativa (ver `pay-invoice.ts`). */
type Db = Prisma.TransactionClient;

function sumAmounts(rows: Array<{ amount: Prisma.Decimal }>): Prisma.Decimal {
  return rows.reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
}

/** Devedor = Σ EXPENSE − Σ CARD_PAYMENT (docs/22-CREDIT_CARDS.md, "Limite"). */
function computeOutstanding(sums: Array<{ type: string; sum: Prisma.Decimal }>): Prisma.Decimal {
  return sums.reduce((total, { type, sum }) => {
    if (type === TransactionType.EXPENSE) return total.plus(sum);
    if (type === TransactionType.CARD_PAYMENT) return total.minus(sum);
    return total;
  }, new Prisma.Decimal(0));
}

async function createCard(userId: string, input: CreateCardData): Promise<Card> {
  return cardRepository.create(userId, input);
}

async function updateCard(userId: string, id: string, input: UpdateCardData): Promise<Card> {
  const updated = await cardRepository.update(userId, id, input);
  if (!updated) throw new CardNotFoundError(id);
  return updated;
}

/** Soft delete — não bloqueia por transações existentes (elas continuam referenciando o cartão normalmente). */
async function deleteCard(userId: string, id: string): Promise<void> {
  const deleted = await cardRepository.softDelete(userId, id);
  if (!deleted) throw new CardNotFoundError(id);
}

async function getCard(userId: string, id: string, db: Db = prisma): Promise<Card> {
  const card = await cardRepository.findById(userId, id, db);
  if (!card) throw new CardNotFoundError(id);
  return card;
}

async function listCards(userId: string): Promise<Card[]> {
  return cardRepository.list(userId);
}

async function buildInvoice(userId: string, cardId: string, cycle: CardCycle): Promise<Invoice> {
  const items: InvoiceItemRow[] = await cardRepository.findExpensesInRange(userId, cardId, {
    gte: cycle.periodStart,
    lt: cycle.periodEnd,
  });

  return {
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    dueDate: cycle.dueDate,
    total: sumAmounts(items),
    items,
  };
}

/**
 * Fatura ABERTA do ciclo atual (docs/22-CREDIT_CARDS.md, "Fatura Atual").
 * `refDate` default = agora em America/Sao_Paulo. Ver `cycle.ts` para a regra
 * completa de fechamento/vencimento.
 */
async function currentInvoice(userId: string, cardId: string, refDate: Date = nowInSaoPaulo()): Promise<Invoice> {
  const card = await getCard(userId, cardId);
  const cycle = cycleContaining(card.closingDay, card.dueDay, refDate);
  return buildInvoice(userId, cardId, cycle);
}

/** Fatura de um ciclo específico, identificado pelo mês/ano em que o FECHAMENTO ocorre (docs/22, "Faturas Futuras"). */
async function invoiceFor(userId: string, cardId: string, year: number, month: number): Promise<Invoice> {
  const card = await getCard(userId, cardId);
  const cycle = cycleForClosingMonth(card.closingDay, card.dueDay, year, month);
  return buildInvoice(userId, cardId, cycle);
}

/**
 * Saldo devedor TOTAL do cartão (docs/22-CREDIT_CARDS.md, "Limite" + Regra 2):
 * soma de TODAS as compras (EXPENSE) já lançadas — inclusive parcelas
 * futuras, que já reservam limite desde a criação (docs/23-INSTALLMENTS.md,
 * "impacta o limite apenas uma vez") — menos o total já pago via
 * CARD_PAYMENT. NÃO é escopado ao ciclo/fatura atual (é o "usado" do limite).
 *
 * Aceita `db` opcional (client padrão ou de uma `$transaction` interativa) —
 * `pay-invoice.ts` passa o `tx` da transação de pagamento pra ler o devedor
 * no mesmo snapshot em que o INSERT do pagamento acontece (evita TOCTOU).
 */
async function outstandingBalance(userId: string, cardId: string, db: Db = prisma): Promise<Money> {
  await getCard(userId, cardId, db); // valida ownership/existência
  const sums = await cardRepository.sumByCardAndType(userId, [cardId], db);
  return computeOutstanding(sums);
}

/** Limite disponível = limite total - devedor (docs/22, "Limite disponível"). */
async function availableLimit(userId: string, cardId: string): Promise<Money> {
  const card = await getCard(userId, cardId);
  const outstanding = await outstandingBalance(userId, cardId);
  return card.limit.minus(outstanding);
}

/**
 * Cartões + fatura atual + limite disponível, sem N+1 (docs/22, "Cards na
 * listagem"). 2 queries no total (compras + soma por tipo), independente do
 * número de cartões — o agrupamento por ciclo (janela de data diferente por
 * cartão, já que cada um tem seu próprio closingDay/dueDay) é feito em
 * memória sobre o resultado já carregado.
 */
async function listWithSummary(userId: string): Promise<CardWithSummary[]> {
  const cards = await cardRepository.list(userId);
  if (cards.length === 0) return [];

  const cardIds = cards.map((card) => card.id);
  const refDate = nowInSaoPaulo();

  const [expenseRows, typeSums] = await Promise.all([
    cardRepository.listExpensesForCards(userId, cardIds),
    cardRepository.sumByCardAndType(userId, cardIds),
  ]);

  const expensesByCard = new Map<string, Array<{ amount: Prisma.Decimal; date: Date }>>();
  for (const row of expenseRows) {
    const bucket = expensesByCard.get(row.cardId) ?? [];
    bucket.push({ amount: row.amount, date: row.date });
    expensesByCard.set(row.cardId, bucket);
  }

  const sumsByCard = new Map<string, Array<{ type: string; sum: Prisma.Decimal }>>();
  for (const row of typeSums) {
    const bucket = sumsByCard.get(row.cardId) ?? [];
    bucket.push({ type: row.type, sum: row.sum });
    sumsByCard.set(row.cardId, bucket);
  }

  return cards.map((card) => {
    const cycle = cycleContaining(card.closingDay, card.dueDay, refDate);
    const cardExpenses = expensesByCard.get(card.id) ?? [];
    const currentInvoiceTotal = sumAmounts(
      cardExpenses.filter((row) => row.date >= cycle.periodStart && row.date < cycle.periodEnd),
    );
    const outstanding = computeOutstanding(sumsByCard.get(card.id) ?? []);

    return {
      ...card,
      currentInvoiceTotal,
      outstandingBalance: outstanding,
      availableLimit: card.limit.minus(outstanding),
      invoiceDueDate: cycle.dueDate,
    };
  });
}

export const cardService = {
  createCard,
  updateCard,
  deleteCard,
  getCard,
  listCards,
  currentInvoice,
  invoiceFor,
  outstandingBalance,
  availableLimit,
  listWithSummary,
};
