import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * Todo cálculo de data do produto é fixado neste timezone (ver
 * docs/01-STACK.md). Timestamps continuam armazenados em UTC no banco
 * (`timestamptz`) — a conversão para America/Sao_Paulo acontece só na
 * apresentação/regra de negócio, nunca na persistência.
 */
export const TIMEZONE = "America/Sao_Paulo";

/** Data/hora atual, ajustada para America/Sao_Paulo. */
export function nowInSaoPaulo(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

/** Interpreta uma data (ISO string ou Date, em UTC) como horário de America/Sao_Paulo. */
export function parseInSaoPaulo(date: string | Date): Date {
  return fromZonedTime(date, TIMEZONE);
}
