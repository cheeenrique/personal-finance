import { toZonedTime } from "date-fns-tz";
import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { TIMEZONE, parseInSaoPaulo } from "@/lib/date/timezone";
import { transactionService } from "@/modules/transactions/service";
import { assetService } from "@/modules/assets/service";
import { reportRepository, type DateRange } from "./repository";
import { InvalidDateRangeError } from "./errors";
import type {
  AccountMovementReport,
  CashflowReport,
  CategoryExpenseTotal,
  IncomeExpenseMonthPoint,
  TotalEvolutionPoint,
} from "./types";

function assertValidRange(dateFrom: Date, dateTo: Date): void {
  if (dateFrom.getTime() > dateTo.getTime()) throw new InvalidDateRangeError(dateFrom, dateTo);
}

/**
 * Janela do ANO inteiro em America/Sao_Paulo, convertida pro instante UTC
 * correto — mesma técnica de `modules/transactions/service.ts` `monthWindowUtc`
 * (construção via `new Date(y, m, d, ...)`, getters locais, é o formato que
 * `parseInSaoPaulo`/`fromZonedTime` espera). `lte` é 1ms antes do início do
 * ano seguinte — cobre o ano inteiro sem incluir o 1º instante do próximo.
 */
function yearWindowUtc(year: number): DateRange {
  const startOfYearLocal = new Date(year, 0, 1, 0, 0, 0, 0);
  const startOfNextYearLocal = new Date(year + 1, 0, 1, 0, 0, 0, 0);

  return {
    gte: parseInSaoPaulo(startOfYearLocal),
    lte: new Date(parseInSaoPaulo(startOfNextYearLocal).getTime() - 1),
  };
}

/** Mês-calendário (1-12) de `date` em America/Sao_Paulo — chave do bucket mensal abaixo. */
function monthOfYearSP(date: Date): number {
  return toZonedTime(date, TIMEZONE).getMonth() + 1;
}

/**
 * REGRA CRÍTICA (docs/03-DATABASE.md, docs/28-REPORTS.md "Exclusão de
 * Transfer e Pagamento de Fatura"): série mensal receita x despesa exclui
 * transferências (`transferId IS NOT NULL`) e `CARD_PAYMENT` — só
 * `type IN (INCOME, EXPENSE)`, `isPaid=true`, `deletedAt=null`. Buscamos o ano
 * inteiro em 1 query (ver `repository.ts` `listIncomeExpenseInRange`) e
 * bucketizamos os 12 meses em memória — zero-fill garante série completa
 * mesmo em meses sem transação (melhor pro gráfico de linha).
 */
async function incomeVsExpenseByMonth(userId: string, year: number): Promise<IncomeExpenseMonthPoint[]> {
  const range = yearWindowUtc(year);
  const rows = await reportRepository.listIncomeExpenseInRange(userId, range);

  const buckets: IncomeExpenseMonthPoint[] = Array.from({ length: 12 }, (_, index) => ({
    year,
    month: index + 1,
    income: new Prisma.Decimal(0),
    expense: new Prisma.Decimal(0),
  }));

  for (const row of rows) {
    const bucket = buckets[monthOfYearSP(row.date) - 1];
    if (row.type === TransactionType.INCOME) {
      bucket.income = bucket.income.plus(row.amount);
    } else {
      bucket.expense = bucket.expense.plus(row.amount);
    }
  }

  return buckets;
}

/**
 * Gasto por categoria no mês — mesma regra de exclusão de
 * `incomeVsExpenseByMonth`. Reaproveita `transactionService.expensesByCategory`
 * (já implementa exatamente esta agregação) em vez de duplicar a query —
 * módulo já pronto, importável (ver escopo da task).
 */
async function expenseByCategory(
  userId: string,
  year: number,
  month: number,
): Promise<CategoryExpenseTotal[]> {
  return transactionService.expensesByCategory(userId, year, month);
}

/** Fluxo de caixa: entradas − saídas num período arbitrário (docs/28-REPORTS.md, "Relatório de Fluxo de Caixa"). */
async function cashflow(userId: string, dateFrom: Date, dateTo: Date): Promise<CashflowReport> {
  assertValidRange(dateFrom, dateTo);

  const { income, expense } = await reportRepository.sumIncomeExpenseInRange(userId, {
    gte: dateFrom,
    lte: dateTo,
  });

  return { dateFrom, dateTo, income, expense, net: income.minus(expense) };
}

/**
 * Movimentação por conta num período — CONTA Transfer e CARD_PAYMENT (regra
 * OPOSTA à de receita/despesa: docs/28-REPORTS.md "Relatório por Conta" —
 * "o que importa é a movimentação da conta, não o ganho/gasto por categoria").
 * INCOME entra como `totalIn` (inclui a perna de destino de uma transferência);
 * EXPENSE e CARD_PAYMENT entram como `totalOut` (inclui a perna de origem de
 * uma transferência e o pagamento de fatura). Ordenado por movimentação total
 * desc (maior movimentação primeiro).
 */
async function accountReport(userId: string, dateFrom: Date, dateTo: Date): Promise<AccountMovementReport[]> {
  assertValidRange(dateFrom, dateTo);

  const rows = await reportRepository.groupMovementByAccountInRange(userId, { gte: dateFrom, lte: dateTo });
  if (rows.length === 0) return [];

  const totalsByAccount = new Map<string, { in: Prisma.Decimal; out: Prisma.Decimal }>();
  for (const row of rows) {
    const totals = totalsByAccount.get(row.accountId) ?? { in: new Prisma.Decimal(0), out: new Prisma.Decimal(0) };
    if (row.type === TransactionType.INCOME) {
      totals.in = totals.in.plus(row.sum);
    } else {
      totals.out = totals.out.plus(row.sum);
    }
    totalsByAccount.set(row.accountId, totals);
  }

  const namesById = await reportRepository.findAccountNamesByIds(userId, Array.from(totalsByAccount.keys()));

  return Array.from(totalsByAccount.entries())
    .map(([accountId, totals]) => ({
      accountId,
      accountName: namesById.get(accountId) ?? "—",
      totalIn: totals.in,
      totalOut: totals.out,
      totalMovement: totals.in.plus(totals.out),
    }))
    .sort((a, b) => b.totalMovement.comparedTo(a.totalMovement));
}

/**
 * Evolução do patrimônio via `AssetSnapshot` (docs/27-ASSETS.md,
 * docs/28-REPORTS.md "Relatório de Patrimônio"). Reaproveita
 * `assetService.evolutionTotal` — já implementa exatamente esta série.
 */
async function patrimonyEvolution(userId: string): Promise<TotalEvolutionPoint[]> {
  return assetService.evolutionTotal(userId);
}

export const reportService = {
  incomeVsExpenseByMonth,
  expenseByCategory,
  cashflow,
  accountReport,
  patrimonyEvolution,
};
