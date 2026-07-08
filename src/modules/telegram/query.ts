import { Prisma } from "@/generated/prisma/client";
import { CardType } from "@/generated/prisma/enums";
import { accountService } from "@/modules/accounts/service";
import { cardService } from "@/modules/cards/service";
import { reportService } from "@/modules/reports/service";
import { transactionService } from "@/modules/transactions/service";
import { nowInSaoPaulo, parseInSaoPaulo } from "@/lib/date/timezone";
import { matchExpenseCategoryByName, resolveOriginStrict } from "./resolve";
import type { TelegramQueryParsed, TelegramQueryPeriod, TelegramQueryResult } from "./types";

/** "Maiores gastos" (docs/30-TELEGRAM.md, "Consulta por IA") — top 5, mesmo tamanho de sempre pro resumo do bot. */
const TOP_CATEGORIES_LIMIT = 5;

/** `{ dateFrom, dateTo }` de um mês-calendário SP — dia 1 e último dia, ambos meia-noite SP (dia 0 do mês seguinte = último dia do mês). */
function monthRange(year: number, monthIndex: number): { dateFrom: Date; dateTo: Date } {
  return {
    dateFrom: parseInSaoPaulo(new Date(year, monthIndex, 1, 0, 0, 0, 0)),
    dateTo: parseInSaoPaulo(new Date(year, monthIndex + 1, 0, 0, 0, 0, 0)),
  };
}

/**
 * Range de datas do período pedido, em America/Sao_Paulo (docs/30-TELEGRAM.md,
 * "Consulta por IA"): `dateFrom`/`dateTo` são a meia-noite SP do primeiro/
 * último dia — o MESMO contrato de `parseFlexibleDate` que o Dashboard e
 * `/reports` passam pra `reportService.cashflow`/`categoryTotals` e
 * `transactionService.unpaidExpenseTotalInRange` (cada uma estende o fim do
 * dia internamente, ver `endOfDayInclusive`/`unpaidExpenseTotalInRange`).
 * Exportada pros comandos determinísticos (`handlers.ts`) usarem o mesmo
 * range — toda resposta de valor do bot sai da MESMA base de fluxo de caixa.
 */
export function resolvePeriodRange(period: TelegramQueryPeriod): { dateFrom: Date; dateTo: Date } {
  const now = nowInSaoPaulo();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  switch (period) {
    case "this_month":
      return monthRange(year, monthIndex);
    case "last_month":
      return monthIndex === 0 ? monthRange(year - 1, 11) : monthRange(year, monthIndex - 1);
    case "this_year":
      return {
        dateFrom: parseInSaoPaulo(new Date(year, 0, 1, 0, 0, 0, 0)),
        dateTo: parseInSaoPaulo(new Date(year, 11, 31, 0, 0, 0, 0)),
      };
  }
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
 * correspondente, SEM reimplementar nenhum cálculo. TODA resposta de valor sai
 * da MESMA base de FLUXO DE CAIXA do Dashboard/`/reports` (só conta, `cardId
 * IS NULL`, `COALESCE(paidAt, date)`, paga, sem transferência): `spent`/
 * `received` via `reportService.cashflow`, `category_total`/`top_categories`
 * via `reportService.categoryTotals` — mesma base, mesmo range ⇒ "quanto
 * gastei" SEMPRE fecha com a soma das categorias do mesmo período (era o bug
 * de inconsistência: categorias vinham da base accrual+cartão,
 * `expensesByCategory`). `unpaid` é o "Previsto / A Pagar" (`isPaid=false`,
 * base própria por definição — dinheiro que ainda não saiu). Nunca lança pra
 * "categoria/cartão não encontrado" — esses são resultados tipados
 * (`TelegramQueryResult`), formatados em texto por `reply.ts`
 * (`buildQueryReply`).
 */
export async function executeTelegramQuery(
  userId: string,
  query: TelegramQueryParsed,
): Promise<TelegramQueryResult> {
  const period = query.period;

  switch (query.queryType) {
    case "spent": {
      const { dateFrom, dateTo } = resolvePeriodRange(period);
      const { expense } = await reportService.cashflow(userId, dateFrom, dateTo);
      return { kind: "spent", total: expense.toString(), period };
    }

    case "received": {
      const { dateFrom, dateTo } = resolvePeriodRange(period);
      const { income } = await reportService.cashflow(userId, dateFrom, dateTo);
      return { kind: "received", total: income.toString(), period };
    }

    case "unpaid": {
      const { dateFrom, dateTo } = resolvePeriodRange(period);
      const total = await transactionService.unpaidExpenseTotalInRange(userId, dateFrom, dateTo);
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

      // Categoria sem lançamento no período fica de fora de `categoryTotals` —
      // ausente = 0, não "categoria não existe" (checado acima via match).
      const { dateFrom, dateTo } = resolvePeriodRange(period);
      const totals = await reportService.categoryTotals(userId, dateFrom, dateTo);
      const total = totals.find((row) => row.categoryId === matched.id)?.total ?? new Prisma.Decimal(0);
      return { kind: "category_total", categoryName: matched.name, total: total.toString(), period };
    }

    case "top_categories": {
      const { dateFrom, dateTo } = resolvePeriodRange(period);
      const totals = await reportService.categoryTotals(userId, dateFrom, dateTo);
      const top = totals.slice(0, TOP_CATEGORIES_LIMIT);

      return {
        kind: "top_categories",
        categories: top.map((row) => ({ name: row.categoryName, total: row.total.toString() })),
        period,
      };
    }

    case "card_invoice":
      return resolveCardInvoice(userId, query.cardName);
  }
}
