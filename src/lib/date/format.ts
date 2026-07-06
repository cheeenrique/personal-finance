import { TIMEZONE } from "./timezone";

/**
 * Formatação de datas para exibição — sempre America/Sao_Paulo, nunca UTC
 * puro (docs/01-STACK.md). Espelha `lib/money/format.ts`: função de
 * apresentação, nunca de cálculo (cálculo de data vive em `calendar-sp.ts`).
 */

/** `DD/MM/YYYY` — formato padrão de input/leitura curta em pt-BR (docs/04-DESIGN_SYSTEM.md, "Data"). */
export function formatDateSaoPaulo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE }).format(date);
}

/** `06 de julho de 2026` — leitura por extenso (docs/04-DESIGN_SYSTEM.md, "Data"). */
export function formatDateLongSaoPaulo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** `06/07/2026 14:32` — usado em listas/cards com necessidade de horário (ex.: AlertCard). */
export function formatDateTimeSaoPaulo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** `YYYY-MM-DD` no calendário de America/Sao_Paulo — valor default de `<input type="date">` (DateField). */
export function toDateInputValueSaoPaulo(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}
