import { toZonedTime } from "date-fns-tz";
import { Prisma } from "@/generated/prisma/client";
import { CardType, TransactionType } from "@/generated/prisma/enums";
import { TIMEZONE, parseInSaoPaulo } from "@/lib/date/timezone";
import { transactionService } from "@/modules/transactions/service";
import { assetService } from "@/modules/assets/service";
import { reportRepository, type DateRange } from "./repository";
import { InvalidDateRangeError } from "./errors";
import { CARD_INVOICE_CATEGORY_NAMES } from "./types";
import type {
  AccountMovementReport,
  CardExpenseGroup,
  CashflowFilters,
  CashflowReport,
  CategoryExpenseTotal,
  CategoryTotalsFilters,
  ExpenseByCardTree,
  IncomeExpenseMonthPoint,
  TotalEvolutionPoint,
} from "./types";

function assertValidRange(dateFrom: Date, dateTo: Date): void {
  if (dateFrom.getTime() > dateTo.getTime()) throw new InvalidDateRangeError(dateFrom, dateTo);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estende `dateTo` (meia-noite SP do dia final, ver `parseFlexibleDate`) até
 * 1ms antes da meia-noite do dia SEGUINTE — necessário só quando o range
 * filtra por `COALESCE(paidAt, date)` (Fluxo de Caixa CORRETO): diferente de
 * `date` (sempre meia-noite), `paidAt` carrega hora real (setado via
 * `new Date()` na transição pendente→paga, `transactions/service.ts`
 * `resolvePaidAtOnUpdate`) — um `lte` cru na meia-noite do último dia cortaria
 * qualquer pagamento feito depois das 00h00 desse dia. Sem risco de DST
 * (Brasil não observa horário de verão desde 2019) — somar 24h em UTC sempre
 * cai na meia-noite SP seguinte.
 */
function endOfDayInclusive(date: Date): Date {
  return new Date(date.getTime() + ONE_DAY_MS - 1);
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
 * Fluxo de Caixa mês a mês CORRETO — MESMA regra de caixa do Dashboard
 * (`transactions/repository.ts` `sumAmountByTypeInRange`): só conta (`cardId
 * IS NULL`), mês pelo MOVIMENTO do dinheiro (`COALESCE(paidAt, date)`), não
 * pela data de competência. Alimenta SÓ o gráfico "Fluxo de caixa" de
 * `/reports` — `incomeVsExpenseByMonth` (acima) fica intocada porque também
 * alimenta a "Evolução mensal" do Dashboard (série histórica por
 * `date`/competência); mudar sua base regrediria aquela tela, fora do escopo
 * deste relatório.
 */
async function cashflowByMonth(
  userId: string,
  year: number,
  filters: CashflowFilters = {},
): Promise<IncomeExpenseMonthPoint[]> {
  const range = yearWindowUtc(year);
  const rows = await reportRepository.listCashflowByMonthInRange(userId, range, filters);

  const buckets: IncomeExpenseMonthPoint[] = Array.from({ length: 12 }, (_, index) => ({
    year,
    month: index + 1,
    income: new Prisma.Decimal(0),
    expense: new Prisma.Decimal(0),
  }));

  for (const row of rows) {
    const bucket = buckets[monthOfYearSP(row.effectiveDate) - 1];
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
 * módulo já pronto, importável (ver escopo da task). Usada pelo Dashboard e
 * pelo Telegram (docs/30-TELEGRAM.md) — mantida intocada, sem filtros extra;
 * ver `categoryTotals` abaixo pro "Por categoria" de `/reports` (período
 * arbitrário + conta + tipo).
 */
async function expenseByCategory(
  userId: string,
  year: number,
  month: number,
): Promise<CategoryExpenseTotal[]> {
  return transactionService.expensesByCategory(userId, year, month);
}

/**
 * Totais por categoria num período ARBITRÁRIO — "Por categoria" de `/reports`,
 * Telegram e resumo semanal (docs/28-REPORTS.md). GASTO REAL accrual
 * (`groupCategoryTotalsInRange`: inclui compra no cartão, bucketizado por
 * `date`) — MESMA base dos budgets, deliberadamente DIFERENTE do KPI
 * "Despesas do mês" (cash-flow, conta-only). O Dashboard NÃO usa mais esta
 * função pro donut (passou pra `expenseByCardTree`, que exclui a fatura);
 * `categoryTotals` continua intocado pros demais consumidores. `dateTo`
 * estendido até o fim do dia (`endOfDayInclusive`). Tipo default EXPENSE;
 * só vira RECEITA quando o filtro pede INCOME.
 */
async function categoryTotals(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  filters: CategoryTotalsFilters = {},
): Promise<CategoryExpenseTotal[]> {
  assertValidRange(dateFrom, dateTo);

  const rows = await reportRepository.groupCategoryTotalsInRange(
    userId,
    { gte: dateFrom, lte: endOfDayInclusive(dateTo) },
    filters,
  );
  if (rows.length === 0) return [];

  const namesById = await reportRepository.findCategoryNamesByIds(
    userId,
    rows.map((row) => row.categoryId),
  );

  return rows
    .map((row) => ({ categoryId: row.categoryId, categoryName: namesById.get(row.categoryId) ?? "—", total: row.sum }))
    .sort((a, b) => b.total.comparedTo(a.total));
}

/**
 * Árvore "Gastos por categoria" do Dashboard (spec
 * 2026-07-08-gastos-por-categoria-arvore-design.md): cartão = pasta,
 * conta = flat, categoria de fatura ("Cartão de Crédito") excluída pra
 * não dobrar o total. Base accrual por `date` (igual `categoryTotals`),
 * mas agrupada por `cardId`. Total resultante NÃO bate com o KPI de
 * caixa — de propósito ("onde gastei" vs "o que saiu da conta").
 */
async function expenseByCardTree(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<ExpenseByCardTree> {
  assertValidRange(dateFrom, dateTo);

  const rows = await reportRepository.groupExpenseByCardAndCategoryInRange(userId, {
    gte: dateFrom,
    lte: endOfDayInclusive(dateTo),
  });
  if (rows.length === 0) return { cards: [], accountCategories: [] };

  const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
  const cardIds = [...new Set(rows.map((row) => row.cardId).filter((id): id is string => id !== null))];

  const [categoryNames, cardMeta] = await Promise.all([
    reportRepository.findCategoryNamesByIds(userId, categoryIds),
    reportRepository.findCardMetaByIds(userId, cardIds),
  ]);

  const invoiceNames = new Set<string>(CARD_INVOICE_CATEGORY_NAMES);

  const cardBuckets = new Map<
    string,
    { name: string; type: CardType; total: Prisma.Decimal; categories: CategoryExpenseTotal[] }
  >();
  const accountCategories: CategoryExpenseTotal[] = [];

  for (const row of rows) {
    const categoryName = categoryNames.get(row.categoryId) ?? "—";
    if (invoiceNames.has(categoryName)) continue;

    const entry: CategoryExpenseTotal = {
      categoryId: row.categoryId,
      categoryName,
      total: row.sum,
    };

    if (row.cardId === null) {
      accountCategories.push(entry);
      continue;
    }

    const meta = cardMeta.get(row.cardId);
    const bucket = cardBuckets.get(row.cardId) ?? {
      name: meta?.name ?? "—",
      type: meta?.type ?? CardType.CREDIT,
      total: new Prisma.Decimal(0),
      categories: [],
    };
    bucket.total = bucket.total.plus(row.sum);
    bucket.categories.push(entry);
    cardBuckets.set(row.cardId, bucket);
  }

  const cards: CardExpenseGroup[] = Array.from(cardBuckets.entries())
    .map(([cardId, bucket]) => ({
      cardId,
      cardName: bucket.name,
      cardType: bucket.type,
      total: bucket.total,
      categories: [...bucket.categories].sort((a, b) => b.total.comparedTo(a.total)),
    }))
    .sort((a, b) => b.total.comparedTo(a.total));

  accountCategories.sort((a, b) => b.total.comparedTo(a.total));

  return { cards, accountCategories };
}

/**
 * Fluxo de caixa CORRETO: entradas − saídas num período arbitrário
 * (docs/28-REPORTS.md, "Relatório de Fluxo de Caixa"), com a MESMA base de
 * caixa do Dashboard (conta-only + `COALESCE(paidAt, date)`, ver
 * `cashflowByMonth` acima) e os filtros globais aplicáveis (conta, categoria,
 * tipo).
 */
async function cashflow(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  filters: CashflowFilters = {},
): Promise<CashflowReport> {
  assertValidRange(dateFrom, dateTo);

  const { income, expense } = await reportRepository.sumCashflowInRange(
    userId,
    { gte: dateFrom, lte: endOfDayInclusive(dateTo) },
    filters,
  );

  return { dateFrom, dateTo, income, expense, net: income.minus(expense) };
}

/**
 * Movimentação por conta num período — CONTA Transfer e CARD_PAYMENT (regra
 * OPOSTA à de receita/despesa: docs/28-REPORTS.md "Relatório por Conta" —
 * "o que importa é a movimentação da conta, não o ganho/gasto por categoria").
 * INCOME entra como `totalIn` (inclui a perna de destino de uma transferência);
 * EXPENSE e CARD_PAYMENT entram como `totalOut` (inclui a perna de origem de
 * uma transferência e o pagamento de fatura). Ordenado por movimentação total
 * desc (maior movimentação primeiro). `accountId` (opcional, filtro global
 * "conta") narrow pra uma única conta — categoria/tipo/cartão não se aplicam
 * aqui (docs/28-REPORTS.md "Relatório por Conta" já cobre transfer/CARD_PAYMENT
 * por design). `dateTo` estendido até o fim do dia (`endOfDayInclusive`):
 * filtra por `date` cru (não `paidAt`/COALESCE, semântica de inclusão
 * intocada), e `date` nem sempre é meia-noite (lançamento rápido/Telegram usa
 * `new Date()` como default) — sem a extensão, uma transação do ÚLTIMO dia do
 * período lançada fora da meia-noite ficaria de fora do `lte` cru.
 */
async function accountReport(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  accountId?: string,
): Promise<AccountMovementReport[]> {
  assertValidRange(dateFrom, dateTo);

  const rows = await reportRepository.groupMovementByAccountInRange(
    userId,
    { gte: dateFrom, lte: endOfDayInclusive(dateTo) },
    accountId,
  );
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
  cashflowByMonth,
  expenseByCategory,
  categoryTotals,
  expenseByCardTree,
  cashflow,
  accountReport,
  patrimonyEvolution,
};
