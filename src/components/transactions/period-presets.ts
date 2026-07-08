import { toDateInputValueSaoPaulo } from "@/lib/date/format";

/**
 * Presets do dropdown "Período" — compartilhado por `/transactions`,
 * `/reports` e o Dashboard (design/PERSONAL_FINANCE_LAYOUT_HANDOFF.md,
 * "Transações"). "custom" (De/Até livre) só existia em `/accounts/[id]`
 * (`use-account-period-filter.ts`, escopo próprio, fora deste preset
 * compartilhado) — promovido aqui pra ficar disponível nas 3 telas
 * (docs/50-AUDITORIA-BACKLOG.md F12).
 */
export type PeriodPreset = "all" | "this_month" | "last_month" | "last_30_days" | "this_year" | "custom";

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "all", label: "Todos os períodos" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "last_30_days", label: "Últimos 30 dias" },
  { value: "this_year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

/** Range livre (De/Até) do preset "custom" — `undefined` quando o usuário ainda não escolheu um dos dois lados. */
export type CustomRange = { dateFrom?: string; dateTo?: string };

type CalendarDate = { year: number; month: number; day: number };

/**
 * "Hoje" no calendário de America/Sao_Paulo — via `toDateInputValueSaoPaulo`
 * (já correto independente do timezone do host/navegador, ver
 * lib/date/format.ts). Aritmética de calendário abaixo usa `Date.UTC` só como
 * calculadora de rollover de mês/ano — nunca como instante real.
 */
function todaySaoPaulo(): CalendarDate {
  const [year, month, day] = toDateInputValueSaoPaulo().split("-").map(Number);
  return { year, month, day };
}

function toDateStr({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsCalendar({ year, month, day }: CalendarDate, delta: number): CalendarDate {
  const anchor = new Date(Date.UTC(year, month - 1 + delta, day));
  return { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() + 1, day: anchor.getUTCDate() };
}

function addDaysCalendar({ year, month, day }: CalendarDate, delta: number): CalendarDate {
  const anchor = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() + 1, day: anchor.getUTCDate() };
}

/**
 * `{ dateFrom, dateTo }` em `YYYY-MM-DD` — compatível com `dateInputSchema`
 * (@/lib/date/schema). `preset === "custom"` devolve o `customRange` recebido
 * como está (sem cálculo de calendário — o usuário escolheu as duas datas
 * livremente); omitido ou incompleto ⇒ mesmo formato de "all" (sem limite de
 * um dos lados), quem chama decide o fallback (ver `resolveDateRange`).
 */
export function periodToRange(preset: PeriodPreset, customRange?: CustomRange): { dateFrom?: string; dateTo?: string } {
  const today = todaySaoPaulo();

  switch (preset) {
    case "all":
      return {};
    case "custom":
      return { dateFrom: customRange?.dateFrom || undefined, dateTo: customRange?.dateTo || undefined };
    case "this_month":
      return {
        dateFrom: toDateStr({ ...today, day: 1 }),
        dateTo: toDateStr({ ...today, day: lastDayOfMonth(today.year, today.month) }),
      };
    case "last_month": {
      const previous = addMonthsCalendar(today, -1);
      return {
        dateFrom: toDateStr({ ...previous, day: 1 }),
        dateTo: toDateStr({ ...previous, day: lastDayOfMonth(previous.year, previous.month) }),
      };
    }
    case "last_30_days":
      return { dateFrom: toDateStr(addDaysCalendar(today, -30)), dateTo: toDateStr(today) };
    case "this_year":
      return {
        dateFrom: toDateStr({ year: today.year, month: 1, day: 1 }),
        dateTo: toDateStr({ year: today.year, month: 12, day: 31 }),
      };
  }
}
