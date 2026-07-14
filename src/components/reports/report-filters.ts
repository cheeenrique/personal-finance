import { TransactionType } from "@/generated/prisma/enums";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { periodToRange, type PeriodPreset } from "@/components/transactions/period-presets";

/** `TRANSFER` aqui é só rótulo de UI (nunca persistido como `type`, ver docs/28-REPORTS.md) — mesma convenção de `TransactionFiltersBar`. */
export type ReportTypeFilter = TransactionType | "TRANSFER";

/**
 * Filtros globais da tela `/reports` (docs/06-SCREENS.md, "Relatórios"):
 * período, categoria, conta, cartão, tipo. Sem `tagId` — o escopo desta tela
 * (backend `modules/reports/service.ts`) não implementa relatório de tags.
 */
export type ReportFiltersState = {
  period: PeriodPreset;
  /** Só usados quando `period === "custom"` (docs/50-AUDITORIA-BACKLOG.md F12). */
  customFrom: string | undefined;
  customTo: string | undefined;
  categoryId: string | undefined;
  accountId: string | undefined;
  cardId: string | undefined;
  type: ReportTypeFilter | undefined;
};

type ParamGetter = (key: string) => string | null;

/** Getter único usado tanto por `URLSearchParams` (client) quanto pelo `searchParams` do App Router (server) — ver `use-report-filters.ts` e `page.tsx`. */
export function parseReportFilters(get: ParamGetter): ReportFiltersState {
  return {
    period: (get("period") as PeriodPreset | null) ?? "this_month",
    customFrom: get("dateFrom") ?? undefined,
    customTo: get("dateTo") ?? undefined,
    categoryId: get("categoryId") ?? undefined,
    accountId: get("accountId") ?? undefined,
    cardId: get("cardId") ?? undefined,
    type: (get("type") as ReportTypeFilter | null) ?? undefined,
  };
}

/** Entradas `[chave, valor]` pra montar a URL — `undefined`/vazio remove o parâmetro (ver `use-report-filters.ts`). */
export function reportFilterEntries(state: ReportFiltersState): [string, string | undefined][] {
  return [
    ["period", state.period === "this_month" ? undefined : state.period],
    ["dateFrom", state.period === "custom" ? state.customFrom : undefined],
    ["dateTo", state.period === "custom" ? state.customTo : undefined],
    ["categoryId", state.categoryId],
    ["accountId", state.accountId],
    ["cardId", state.cardId],
    ["type", state.type],
  ];
}

export function hasActiveReportFilters(state: ReportFiltersState): boolean {
  return Boolean(
    state.period !== "this_month" || state.categoryId || state.accountId || state.cardId || state.type,
  );
}

/**
 * Intervalo de datas efetivo pro período selecionado — `reportService.cashflow`/
 * `accountReport` exigem `dateFrom`/`dateTo` sempre presentes (nunca opcionais,
 * ver `modules/reports/service.ts`). `periodToRange("all")` (e "custom" sem
 * as 2 datas escolhidas ainda) devolve `{}` (sem limite) — aqui resolvemos pro
 * default "ano corrente até hoje" nesse caso, em vez de propagar `undefined`
 * pro service.
 */
export function resolveDateRange(period: PeriodPreset, custom?: { dateFrom?: string; dateTo?: string }): { dateFrom: string; dateTo: string } {
  const range = periodToRange(period, custom);
  if (range.dateFrom && range.dateTo) return { dateFrom: range.dateFrom, dateTo: range.dateTo };

  const today = toDateInputValueSaoPaulo();
  const year = today.slice(0, 4);
  return { dateFrom: `${year}-01-01`, dateTo: today };
}

/** `year`/`month` de referência pro relatório de categorias/orçamento — só aceitam um mês por vez (ver `modules/reports/service.ts`). Usa o fim do intervalo selecionado como referência. */
export function deriveYearMonth(dateTo: string): { year: number; month: number } {
  const [year, month] = dateTo.split("-").map(Number);
  return { year, month };
}
