import { Prisma } from "@/generated/prisma/client";
import { CardType } from "@/generated/prisma/enums";
import { accountService } from "@/modules/accounts/service";
import { cardService } from "@/modules/cards/service";
import { reportService } from "@/modules/reports/service";
import { transactionService } from "@/modules/transactions/service";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { matchExpenseCategoryByName, resolveOriginStrict } from "./resolve";
import type { TelegramQueryParsed, TelegramQueryPeriod, TelegramQueryResult } from "./types";

/** "Maiores gastos" (docs/30-TELEGRAM.md, "Consulta por IA") — top 5, mesmo tamanho de sempre pro resumo do bot. */
const TOP_CATEGORIES_LIMIT = 5;

/**
 * `{ year, month }` do(s) mês(es) cobertos pelo período pedido, em
 * America/Sao_Paulo (docs/30-TELEGRAM.md, "Consulta por IA"): "this_month"/
 * "last_month" resolvem pra 1 mês; "this_year" resolve pros 12 meses do ano
 * corrente (zero-fill natural — meses futuros ainda sem lançamento somam 0,
 * mesmo raciocínio de `reportService.incomeVsExpenseByMonth`).
 */
function resolveMonths(period: TelegramQueryPeriod): Array<{ year: number; month: number }> {
  const now = nowInSaoPaulo();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  switch (period) {
    case "this_month":
      return [{ year, month }];
    case "last_month":
      return month === 1 ? [{ year: year - 1, month: 12 }] : [{ year, month: month - 1 }];
    case "this_year":
      return Array.from({ length: 12 }, (_, index) => ({ year, month: index + 1 }));
  }
}

/**
 * Soma um KPI mensal já existente (`transactionService.monthlyExpenseTotal`/
 * `monthlyIncomeTotal`/`monthlyUnpaidExpenseTotal`) por todos os meses do
 * período — mesma lógica de fluxo de caixa dos KPIs do Dashboard, nunca
 * reimplementada aqui (docs/30-TELEGRAM.md, "Consulta por IA"). 1 chamada por
 * mês, em paralelo — o período "this_year" é só 12 chamadas leves (índice já
 * cobre `userId + isPaid + type + data`, ver `sumAmountByTypeInRange`).
 */
async function sumOverMonths(
  userId: string,
  months: Array<{ year: number; month: number }>,
  monthlyTotal: (userId: string, year: number, month: number) => Promise<Prisma.Decimal>,
): Promise<Prisma.Decimal> {
  const totals = await Promise.all(months.map(({ year, month }) => monthlyTotal(userId, year, month)));
  return totals.reduce((sum, total) => sum.plus(total), new Prisma.Decimal(0));
}

type CategoryTotalsMap = Map<string, { categoryName: string; total: Prisma.Decimal }>;

/**
 * Gasto por categoria somado por todos os meses do período — reusa
 * `reportService.expenseByCategory` (já implementa a agregação mês a mês,
 * excluindo transfer/CARD_PAYMENT) por `categoryId`, insumo de
 * `category_total` e `top_categories` (docs/30-TELEGRAM.md, "Consulta por
 * IA"). Categoria sem NENHUM lançamento no período fica de fora do mapa —
 * o chamador trata "ausente" como 0, não como "categoria não existe" (essa
 * checagem é feita à parte, via `matchExpenseCategoryByName`).
 */
async function categoryTotalsOverMonths(
  userId: string,
  months: Array<{ year: number; month: number }>,
): Promise<CategoryTotalsMap> {
  const perMonth = await Promise.all(
    months.map(({ year, month }) => reportService.expenseByCategory(userId, year, month)),
  );

  const totals: CategoryTotalsMap = new Map();
  for (const rows of perMonth) {
    for (const row of rows) {
      const existing = totals.get(row.categoryId);
      const total = (existing?.total ?? new Prisma.Decimal(0)).plus(row.total);
      totals.set(row.categoryId, { categoryName: row.categoryName, total });
    }
  }

  return totals;
}

/**
 * Fatura de um cartão citado por nome (docs/30-TELEGRAM.md, "Consulta por
 * IA", `card_invoice`). Reusa `resolveOriginStrict` (mesmo matching de nome
 * — exato, depois "contém", com ruído de canal removido — usado pelo fluxo
 * de lançamento) forçando `paymentMethod="credit"` (só cartão bate) e
 * `cardService.listWithSummary` (já traz `currentInvoiceTotal`/
 * `invoiceDueDate` calculados pelo ciclo vigente, sem duplicar a lógica de
 * `currentInvoice`). Evita chamar `cardService.currentInvoice` diretamente
 * pra não arriscar `CardTypeNotSupportedError` num cartão MEAL — aqui isso
 * vira um resultado tipado (`card_no_invoice`), não uma exception.
 */
async function resolveCardInvoice(userId: string, cardName: string | null): Promise<TelegramQueryResult> {
  if (!cardName) return { kind: "card_not_found", cardName: "" };

  const originResult = await resolveOriginStrict(userId, "credit", "card", cardName);

  if (originResult.status === "ambiguous") {
    return { kind: "card_ambiguous", candidates: originResult.candidates.map((candidate) => candidate.label) };
  }
  if (originResult.status === "none") {
    return { kind: "card_not_found", cardName };
  }

  const cards = await cardService.listWithSummary(userId);
  const card = cards.find((item) => item.id === originResult.origin.id);
  if (!card) return { kind: "card_not_found", cardName };

  if (card.type !== CardType.CREDIT) {
    return { kind: "card_no_invoice", cardName: card.name };
  }

  return {
    kind: "card_invoice",
    cardName: card.name,
    total: card.currentInvoiceTotal.toString(),
    dueDate: card.invoiceDueDate,
  };
}

/**
 * Executa uma consulta já classificada/parseada pela IA (docs/30-TELEGRAM.md,
 * "Consulta por IA") — mapeia cada `queryType` pro service de domínio
 * correspondente, SEM reimplementar nenhum cálculo (`transactionService`/
 * `accountService`/`cardService`/`reportService`, os mesmos usados pelos
 * KPIs do app web). Nunca lança pra "categoria/cartão não encontrado" —
 * esses são resultados tipados (`TelegramQueryResult`), formatados em texto
 * por `reply.ts` (`buildQueryReply`).
 */
export async function executeTelegramQuery(
  userId: string,
  query: TelegramQueryParsed,
): Promise<TelegramQueryResult> {
  const period = query.period;

  switch (query.queryType) {
    case "spent": {
      const total = await sumOverMonths(userId, resolveMonths(period), transactionService.monthlyExpenseTotal);
      return { kind: "spent", total: total.toString(), period };
    }

    case "received": {
      const total = await sumOverMonths(userId, resolveMonths(period), transactionService.monthlyIncomeTotal);
      return { kind: "received", total: total.toString(), period };
    }

    case "unpaid": {
      const total = await sumOverMonths(userId, resolveMonths(period), transactionService.monthlyUnpaidExpenseTotal);
      return { kind: "unpaid", total: total.toString(), period };
    }

    case "balance": {
      const total = await accountService.totalBalance(userId);
      return { kind: "balance", total: total.toString() };
    }

    case "category_total": {
      if (!query.categoryName) return { kind: "category_not_found", categoryName: "" };

      const matched = await matchExpenseCategoryByName(userId, query.categoryName);
      if (!matched) return { kind: "category_not_found", categoryName: query.categoryName };

      const totals = await categoryTotalsOverMonths(userId, resolveMonths(period));
      const total = totals.get(matched.id)?.total ?? new Prisma.Decimal(0);
      return { kind: "category_total", categoryName: matched.name, total: total.toString(), period };
    }

    case "top_categories": {
      const totals = await categoryTotalsOverMonths(userId, resolveMonths(period));
      const sorted = [...totals.values()]
        .sort((a, b) => b.total.comparedTo(a.total))
        .slice(0, TOP_CATEGORIES_LIMIT);

      return {
        kind: "top_categories",
        categories: sorted.map((entry) => ({ name: entry.categoryName, total: entry.total.toString() })),
        period,
      };
    }

    case "card_invoice":
      return resolveCardInvoice(userId, query.cardName);
  }
}
