import { Prisma, type Card, type CardCycle as CardCycleRow, type CardInvoice } from "@/generated/prisma/client";
import { TransactionType, CardType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import {
  cardRepository,
  type CreateCardData,
  type UpdateCardData,
  type InvoiceItemRow,
  type CardWithCycles,
} from "./repository";
import { cycleContaining, cycleForClosingMonth, type CardCycle, type CycleRule } from "./cycle";
import { CardNotFoundError, CardTypeNotSupportedError } from "./errors";
import type { CardWithSummary, Invoice, Money } from "./types";

/** Client Prisma padrão ou escopado a uma `$transaction` interativa (ver `pay-invoice.ts`). */
type Db = Prisma.TransactionClient;

/** `CardCycle` (linha do banco) → `CycleRule` (formato solto de `cycle.ts`, sem `id`/`cardId`/`createdAt`). */
function toCycleRules(cycles: CardCycleRow[]): CycleRule[] {
  return cycles.map((cycle) => ({
    closingDay: cycle.closingDay,
    dueDay: cycle.dueDay,
    effectiveFrom: cycle.effectiveFrom,
  }));
}

function sumAmounts(rows: Array<{ amount: Prisma.Decimal }>): Prisma.Decimal {
  return rows.reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
}

/** Devedor = Σ EXPENSE − Σ CARD_PAYMENT (docs/22-CREDIT_CARDS.md, "Limite"). Ignora INCOME (não existe em cartão CREDIT no fluxo normal). */
function computeOutstanding(sums: Array<{ type: string; sum: Prisma.Decimal }>): Prisma.Decimal {
  return sums.reduce((total, { type, sum }) => {
    if (type === TransactionType.EXPENSE) return total.plus(sum);
    if (type === TransactionType.CARD_PAYMENT) return total.minus(sum);
    return total;
  }, new Prisma.Decimal(0));
}

/**
 * Saldo do cartão MEAL (feature de cartão pré-pago, sem doc dedicado ainda —
 * ver `prisma/schema.prisma` `CardType`): Σ INCOME (recarga) − Σ EXPENSE
 * (gasto), ambos `isPaid=true`, sem noção de ciclo/fatura (MEAL não tem).
 * Ignora CARD_PAYMENT (cartão MEAL não tem fatura pra pagar).
 */
function computeMealBalance(sums: Array<{ type: string; sum: Prisma.Decimal }>): Prisma.Decimal {
  return sums.reduce((total, { type, sum }) => {
    if (type === TransactionType.INCOME) return total.plus(sum);
    if (type === TransactionType.EXPENSE) return total.minus(sum);
    return total;
  }, new Prisma.Decimal(0));
}

/** Σ INCOME (recarga) do cartão MEAL — metade de `computeMealBalance` isolada pra exibir a barra `gasto / recarga` na UI (dashboard "Cartões e dívidas" + tile). */
function sumMealRecharged(sums: Array<{ type: string; sum: Prisma.Decimal }>): Prisma.Decimal {
  const row = sums.find((entry) => entry.type === TransactionType.INCOME);
  return row ? row.sum : new Prisma.Decimal(0);
}

/** Σ EXPENSE (gasto) do cartão MEAL — a outra metade de `computeMealBalance`, mesma razão de `sumMealRecharged`. */
function sumMealSpent(sums: Array<{ type: string; sum: Prisma.Decimal }>): Prisma.Decimal {
  const row = sums.find((entry) => entry.type === TransactionType.EXPENSE);
  return row ? row.sum : new Prisma.Decimal(0);
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

async function getCard(userId: string, id: string, db: Db = prisma): Promise<CardWithCycles> {
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
 * Fatura/ciclo/limite (CREDIT) não se aplicam a cartão MEAL (docs/22-CREDIT_CARDS.md
 * não cobre esse tipo — saldo pré-pago não tem fechamento nem vencimento).
 * Chamada em toda função CREDIT-only logo após `getCard`.
 */
function assertCreditCard(card: Card, operation: string): void {
  if (card.type !== CardType.CREDIT) {
    throw new CardTypeNotSupportedError(card.id, operation, CardType.CREDIT);
  }
}

/**
 * Fatura ABERTA do ciclo atual (docs/22-CREDIT_CARDS.md, "Fatura Atual").
 * `refDate` default = agora em America/Sao_Paulo. Ver `cycle.ts` para a regra
 * completa de fechamento/vencimento. CREDIT-only — ver `assertCreditCard`.
 */
async function currentInvoice(userId: string, cardId: string, refDate: Date = nowInSaoPaulo()): Promise<Invoice> {
  const card = await getCard(userId, cardId);
  assertCreditCard(card, "currentInvoice");
  const fallback = { closingDay: card.closingDay, dueDay: card.dueDay };
  const cycle = cycleContaining(toCycleRules(card.cycles), fallback, refDate);
  return buildInvoice(userId, cardId, cycle);
}

/**
 * Fatura de um ciclo específico, identificado pelo mês/ano em que o FECHAMENTO
 * ocorre (docs/22, "Faturas Futuras"). CREDIT-only — ver `assertCreditCard`.
 */
async function invoiceFor(userId: string, cardId: string, year: number, month: number): Promise<Invoice> {
  const card = await getCard(userId, cardId);
  assertCreditCard(card, "invoiceFor");
  const fallback = { closingDay: card.closingDay, dueDay: card.dueDay };
  const cycle = cycleForClosingMonth(toCycleRules(card.cycles), fallback, year, month);
  return buildInvoice(userId, cardId, cycle);
}

/**
 * Saldo devedor TOTAL do cartão (docs/22-CREDIT_CARDS.md, "Limite" + Regra 2):
 * soma de TODAS as compras (EXPENSE) já lançadas — inclusive parcelas
 * futuras, que já reservam limite desde a criação (docs/23-INSTALLMENTS.md,
 * "impacta o limite apenas uma vez") — menos o total já pago via
 * CARD_PAYMENT. NÃO é escopado ao ciclo/fatura atual (é o "usado" do limite).
 * CREDIT-only — ver `assertCreditCard`.
 *
 * Aceita `db` opcional (client padrão ou de uma `$transaction` interativa) —
 * `pay-invoice.ts` passa o `tx` da transação de pagamento pra ler o devedor
 * DEPOIS do `SELECT ... FOR UPDATE` na linha do cartão (é o lock que fecha o
 * TOCTOU entre pagamentos concorrentes, não a transação em si — ver o JSDoc
 * de `payInvoice`).
 */
async function outstandingBalance(userId: string, cardId: string, db: Db = prisma): Promise<Money> {
  const card = await getCard(userId, cardId, db); // valida ownership/existência
  assertCreditCard(card, "outstandingBalance");
  const sums = await cardRepository.sumByCardAndType(userId, [cardId], db);
  return computeOutstanding(sums);
}

/** Limite disponível = limite total - devedor (docs/22, "Limite disponível"). CREDIT-only (propaga o guard de `outstandingBalance`). */
async function availableLimit(userId: string, cardId: string): Promise<Money> {
  const card = await getCard(userId, cardId);
  const outstanding = await outstandingBalance(userId, cardId);
  return card.limit.minus(outstanding);
}

/**
 * Saldo do cartão MEAL (recargas − gastos, ver `computeMealBalance`) —
 * equivalente a `outstandingBalance`/`availableLimit` para CREDIT, mas sem
 * conceito de limite (MEAL não tem "crédito", só o que foi recarregado).
 * MEAL-only — guard simétrico ao de `assertCreditCard`.
 */
async function mealBalance(userId: string, cardId: string, db: Db = prisma): Promise<Money> {
  const card = await getCard(userId, cardId, db);
  if (card.type !== CardType.MEAL) {
    throw new CardTypeNotSupportedError(cardId, "mealBalance", CardType.MEAL);
  }
  const sums = await cardRepository.sumByCardAndType(userId, [cardId], db);
  return computeMealBalance(sums);
}

/**
 * Cartões + resumo derivado, sem N+1 (docs/22, "Cards na listagem"). 3 queries
 * no total (compras + soma por tipo + histórico de ciclo), independente do
 * número de cartões — o agrupamento por ciclo (janela de data diferente por
 * cartão, já que cada um tem seu próprio closingDay/dueDay, e pode ainda ter
 * mudado ao longo do tempo via `CardCycle`) é feito em memória sobre o
 * resultado já carregado.
 *
 * Ramifica por `card.type` (ver types.ts `CardWithSummary` — shape único, não
 * discriminado, de propósito: task é só backend, ver JSDoc do tipo): CREDIT
 * calcula fatura atual + devedor + limite disponível igual a antes (fluxo
 * INTACTO, zero regressão) e `mealBalance`/`mealRecharged`/`mealSpent=null`;
 * MEAL preenche os 4 campos CREDIT com placeholder neutro (nunca consumido
 * por UI hoje — nenhum cartão MEAL existe ainda) e calcula `mealBalance`,
 * `mealRecharged` (Σ INCOME) e `mealSpent` (Σ EXPENSE) de verdade a partir do
 * MESMO `sumByCardAndType` (sem query nova) — a UI usa `mealSpent`/
 * `mealRecharged` pra desenhar a barra `gasto / recarga` igual à de limite do
 * CREDIT (`mealBalance` continua sendo só o saldo derivado). `expenseRows`/
 * `cycleRows` são buscados pra TODOS os cartões (query única, sem N+1) mas só
 * usados no ramo CREDIT — overhead desprezível pro volume do app (poucos
 * cartões por usuário).
 */
async function listWithSummary(userId: string): Promise<CardWithSummary[]> {
  const cards = await cardRepository.list(userId);
  if (cards.length === 0) return [];

  const cardIds = cards.map((card) => card.id);
  const refDate = nowInSaoPaulo();

  const [expenseRows, typeSums, cycleRows] = await Promise.all([
    cardRepository.listExpensesForCards(userId, cardIds),
    cardRepository.sumByCardAndType(userId, cardIds),
    cardRepository.listCyclesForCards(cardIds),
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

  const cyclesByCard = new Map<string, CardCycleRow[]>();
  for (const row of cycleRows) {
    const bucket = cyclesByCard.get(row.cardId) ?? [];
    bucket.push(row);
    cyclesByCard.set(row.cardId, bucket);
  }

  return cards.map((card): CardWithSummary => {
    const sums = sumsByCard.get(card.id) ?? [];

    if (card.type === CardType.MEAL) {
      // Placeholders neutros (docs em types.ts `CardWithSummary`) — `limit`
      // do MEAL já é 0 (ver schemas.ts), então `availableLimit` cai em 0
      // naturalmente. `invoiceDueDate` não tem significado pra MEAL; `refDate`
      // é só um valor `Date` válido pro shape, nunca renderizado hoje.
      return {
        ...card,
        currentInvoiceTotal: new Prisma.Decimal(0),
        outstandingBalance: new Prisma.Decimal(0),
        availableLimit: card.limit,
        invoiceDueDate: refDate,
        mealBalance: computeMealBalance(sums),
        mealRecharged: sumMealRecharged(sums),
        mealSpent: sumMealSpent(sums),
      };
    }

    const fallback = { closingDay: card.closingDay, dueDay: card.dueDay };
    const cycle = cycleContaining(toCycleRules(cyclesByCard.get(card.id) ?? []), fallback, refDate);
    const cardExpenses = expensesByCard.get(card.id) ?? [];
    const currentInvoiceTotal = sumAmounts(
      cardExpenses.filter((row) => row.date >= cycle.periodStart && row.date < cycle.periodEnd),
    );
    const outstanding = computeOutstanding(sums);

    return {
      ...card,
      currentInvoiceTotal,
      outstandingBalance: outstanding,
      availableLimit: card.limit.minus(outstanding),
      invoiceDueDate: cycle.dueDate,
      mealBalance: null,
      mealRecharged: null,
      mealSpent: null,
    };
  });
}

/**
 * Histórico REAL de faturas fechadas (armazenadas), mais recente primeiro —
 * ver docs/22-CREDIT_CARDS.md. A fatura ABERTA (ciclo atual) continua
 * CALCULADA via `currentInvoice`, intocada. Cartão sem nenhuma `CardInvoice`
 * armazenada retorna lista vazia — o chamador (página) decide se cai no
 * fallback calculado por ciclo (`invoiceFor`). CREDIT-only — ver `assertCreditCard`.
 */
async function listStoredInvoices(userId: string, cardId: string): Promise<CardInvoice[]> {
  const card = await getCard(userId, cardId); // valida ownership/existência
  assertCreditCard(card, "listStoredInvoices");
  return cardRepository.listInvoices(cardId);
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
  mealBalance,
  listWithSummary,
  listStoredInvoices,
};
