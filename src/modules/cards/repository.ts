import { prisma } from "@/lib/db/client";
import { Prisma, type Card, type CardCycle, type CardInvoice } from "@/generated/prisma/client";
import { TransactionType, type CardType } from "@/generated/prisma/enums";

/** Client Prisma padrão ou escopado a uma `$transaction` interativa (ver `pay-invoice.ts`). */
type Db = Prisma.TransactionClient;

/** Card + histórico de troca de ciclo, ordenado por `effectiveFrom` (ver service.ts, `cycle.ts`). */
export type CardWithCycles = Card & { cycles: CardCycle[] };

export type CreateCardData = {
  name: string;
  brand: string;
  /** Imutável após a criação (docs/22-CREDIT_CARDS.md) — `UpdateCardData` (abaixo) nunca a inclui. */
  type: CardType;
  limit: string;
  closingDay: number;
  dueDay: number;
  color?: string | null;
  icon?: string | null;
};

export type UpdateCardData = Partial<CreateCardData> & { isActive?: boolean };

/** Uma compra (EXPENSE) crua, usada tanto na fatura de um ciclo quanto no agrupamento em memória de `listWithSummary`. */
export type CardExpenseRow = { cardId: string; amount: Prisma.Decimal; date: Date };

/** Soma agregada de Transactions por cartão+tipo — insumo de `outstandingBalance` (ver service.ts). */
export type CardTypeSum = { cardId: string; type: string; sum: Prisma.Decimal };

export type InvoiceItemRow = {
  id: string;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  installmentNumber: number | null;
  installmentPurchaseId: string | null;
};

/**
 * Acesso a dados do módulo cards. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

/** Inclui `cycles` (histórico de troca de ciclo) sempre — tabela filha pequena, custo desprezível mesmo quando o chamador só precisa do cartão em si. */
async function findById(userId: string, id: string, db: Db = prisma): Promise<CardWithCycles | null> {
  return db.card.findFirst({
    where: { id, userId, deletedAt: null },
    include: { cycles: { orderBy: { effectiveFrom: "asc" } } },
  });
}

async function list(userId: string): Promise<Card[]> {
  return prisma.card.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

async function create(userId: string, data: CreateCardData): Promise<Card> {
  return prisma.card.create({
    data: {
      userId,
      name: data.name,
      brand: data.brand,
      type: data.type,
      limit: data.limit,
      closingDay: data.closingDay,
      dueDay: data.dueDay,
      color: data.color ?? null,
      icon: data.icon ?? null,
    },
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * cartão de outro usuário mesmo sabendo o `id` (cuid não é enumerável, mas o
 * isolamento por userId é a regra de ouro do projeto, não opcional).
 */
async function update(userId: string, id: string, data: UpdateCardData): Promise<Card | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.card.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.brand !== undefined && { brand: data.brand }),
      ...(data.limit !== undefined && { limit: data.limit }),
      ...(data.closingDay !== undefined && { closingDay: data.closingDay }),
      ...(data.dueDay !== undefined && { dueDay: data.dueDay }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

/** Soft delete — nunca remove fisicamente (mesmo padrão de accounts/transactions). */
async function softDelete(userId: string, id: string): Promise<Card | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.card.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Compras (EXPENSE, incluindo parcelas) do cartão dentro de um intervalo —
 * insumo direto da fatura de um ciclo (ver service.ts `currentInvoice` /
 * `invoiceFor`). `isPaid: true` é redundante com a regra de negócio (compra
 * no cartão nasce sempre `isPaid=true`, docs/22-CREDIT_CARDS.md) mas mantido
 * explícito por defesa em profundidade, igual ao filtro equivalente em
 * `modules/accounts/repository.ts`.
 */
async function findExpensesInRange(
  userId: string,
  cardId: string,
  range: { gte: Date; lt: Date },
): Promise<InvoiceItemRow[]> {
  return prisma.transaction.findMany({
    where: {
      userId,
      cardId,
      type: TransactionType.EXPENSE,
      isPaid: true,
      deletedAt: null,
      date: { gte: range.gte, lt: range.lt },
    },
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      installmentNumber: true,
      installmentPurchaseId: true,
    },
    orderBy: { date: "asc" },
  });
}

/**
 * TODAS as compras (EXPENSE) dos cartões informados, sem filtro de data —
 * insumo de `listWithSummary` (docs/22, "Cards na listagem"). O agrupamento
 * por ciclo é feito em memória no service, já que cada cartão tem seu
 * próprio `closingDay`/`dueDay` (janelas de data diferentes por cartão não
 * dá pra expressar num único `groupBy`). 1 query para N cartões, sem N+1.
 */
async function listExpensesForCards(userId: string, cardIds: string[]): Promise<CardExpenseRow[]> {
  if (cardIds.length === 0) return [];

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      cardId: { in: cardIds },
      type: TransactionType.EXPENSE,
      isPaid: true,
      deletedAt: null,
    },
    select: { cardId: true, amount: true, date: true },
  });

  return rows
    .filter((row): row is typeof row & { cardId: string } => row.cardId !== null)
    .map((row) => ({ cardId: row.cardId, amount: row.amount, date: row.date }));
}

/**
 * Soma de EXPENSE/CARD_PAYMENT/INCOME por cartão, agrupada por tipo — insumo
 * de `outstandingBalance`/`availableLimit` (CREDIT, docs/22, "Limite
 * disponível = limite total - fatura atual" / Regra 2) e de `mealBalance`
 * (MEAL: recarga = INCOME no cartão − gasto = EXPENSE no cartão, ver
 * service.ts). Não filtra data — o devedor do cartão CREDIT considera TODAS
 * as compras já lançadas (inclusive parcelas futuras, que já reservam limite
 * desde a criação, docs/23-INSTALLMENTS.md); o saldo MEAL também é histórico
 * completo (sem noção de ciclo). INCOME é irrelevante para CREDIT
 * (`computeOutstanding` ignora o tipo) e CARD_PAYMENT é irrelevante para MEAL
 * (cartão MEAL não tem fatura pra pagar) — cada service consome só os tipos
 * que fazem sentido pro seu cálculo.
 *
 * Aceita `db` opcional (client padrão ou de uma `$transaction` interativa) —
 * usado por `pay-invoice.ts` pra ler o devedor dentro da MESMA transação que
 * grava o pagamento, sob o `SELECT ... FOR UPDATE` da linha do cartão (é o
 * lock que fecha o TOCTOU entre pagamentos concorrentes — ver `payInvoice`).
 */
async function sumByCardAndType(userId: string, cardIds: string[], db: Db = prisma): Promise<CardTypeSum[]> {
  if (cardIds.length === 0) return [];

  const rows = await db.transaction.groupBy({
    by: ["cardId", "type"],
    where: {
      userId,
      cardId: { in: cardIds },
      type: { in: [TransactionType.EXPENSE, TransactionType.CARD_PAYMENT, TransactionType.INCOME] },
      isPaid: true,
      deletedAt: null,
    },
    _sum: { amount: true },
  });

  return rows
    .filter((row): row is typeof row & { cardId: string } => row.cardId !== null)
    .map((row) => ({
      cardId: row.cardId,
      type: row.type,
      sum: row._sum.amount ?? new Prisma.Decimal(0),
    }));
}

/**
 * Histórico de troca de ciclo (`CardCycle`) de todos os cartões informados,
 * ordenado por `effectiveFrom` — insumo de `listWithSummary` (mesma razão de
 * `listExpensesForCards`: cada cartão tem seu próprio ciclo vigente, o
 * agrupamento é feito em memória no service). 1 query para N cartões, sem
 * N+1. Sem `userId` — `CardCycle` não tem coluna própria (docs/03-DATABASE.md,
 * exceção `TransactionTag`/`AssetSnapshot`); os `cardIds` já vêm escopados
 * por `userId` do chamador (`cardRepository.list`).
 */
async function listCyclesForCards(cardIds: string[]): Promise<CardCycle[]> {
  if (cardIds.length === 0) return [];

  return prisma.cardCycle.findMany({
    where: { cardId: { in: cardIds } },
    orderBy: { effectiveFrom: "asc" },
  });
}

/**
 * Faturas FECHADAS armazenadas de um cartão (docs/22-CREDIT_CARDS.md,
 * "Lógica de Fatura") — histórico real (importado), em vez do cálculo por
 * ciclo em `cycle.ts` (que não bate pra parcelas de extrato importado). Sem
 * filtro de `userId` — `CardInvoice` não tem coluna própria (mesma exceção
 * consciente de `CardCycle`, docs/03-DATABASE.md); ownership é validada pelo
 * chamador (`cardService.listStoredInvoices`, via `getCard`) antes de listar.
 */
async function listInvoices(cardId: string): Promise<CardInvoice[]> {
  return prisma.cardInvoice.findMany({
    where: { cardId },
    orderBy: { dueDate: "desc" },
  });
}

export const cardRepository = {
  findById,
  list,
  create,
  update,
  softDelete,
  listCyclesForCards,
  findExpensesInRange,
  listExpensesForCards,
  sumByCardAndType,
  listInvoices,
};
