import { describe, expect, it } from "vitest";
import { calendarPartsSP } from "@/lib/date/calendar-sp";
import { cycleContaining, cycleForClosingMonth, previousClosedCycle, type CycleFallback, type CycleRule } from "./cycle";

/**
 * `previousClosedCycle` (docs/superpowers/specs/2026-07-13-cartao-vencimento-fatura-status-design.md,
 * "achado central"): ciclo imediatamente ANTERIOR ao ciclo ABERTO — a fatura
 * que JÁ FECHOU e está aguardando pagamento. Primeira cobertura de teste real
 * do módulo (`cycle.ts` não tinha nenhum teste antes desta entrega).
 */
describe("previousClosedCycle", () => {
  it("vencimento no MESMO mês do fechamento (dueDay > closingDay): acha o ciclo fechado imediatamente anterior ao aberto", () => {
    const fallback: CycleFallback = { closingDay: 10, dueDay: 20 };
    // 15/jul, depois do fechamento de 10/jul -> ciclo aberto é [10/jul, 10/ago).
    const refDate = new Date("2026-07-15T12:00:00-03:00");
    const openCycle = cycleContaining([], fallback, refDate);

    const closedCycle = previousClosedCycle([], fallback, openCycle);

    // O fechamento da fatura fechada é exatamente o início do ciclo aberto.
    expect(closedCycle.periodEnd.getTime()).toBe(openCycle.periodStart.getTime());

    const { year, month } = calendarPartsSP(openCycle.periodStart);
    const expected = cycleForClosingMonth([], fallback, year, month);
    expect(closedCycle).toEqual(expected);
  });

  it("vencimento no mês SEGUINTE ao fechamento (dueDay <= closingDay): acha o ciclo fechado imediatamente anterior ao aberto", () => {
    const fallback: CycleFallback = { closingDay: 25, dueDay: 5 };
    // 28/jul, depois do fechamento de 25/jul -> ciclo aberto é [25/jul, 25/ago).
    const refDate = new Date("2026-07-28T12:00:00-03:00");
    const openCycle = cycleContaining([], fallback, refDate);

    const closedCycle = previousClosedCycle([], fallback, openCycle);

    expect(closedCycle.periodEnd.getTime()).toBe(openCycle.periodStart.getTime());

    const { year, month } = calendarPartsSP(openCycle.periodStart);
    const expected = cycleForClosingMonth([], fallback, year, month);
    expect(closedCycle).toEqual(expected);
    // Vencimento cai no mês seguinte ao fechamento (dueDay=5 <= closingDay=25).
    expect(closedCycle.dueDate.getUTCMonth()).not.toBe(closedCycle.periodEnd.getUTCMonth());
  });

  it("estável através de uma troca de CardCycle no meio do histórico", () => {
    const fallback: CycleFallback = { closingDay: 10, dueDay: 20 };
    // Regra muda em 01/jul/2026 para fechar dia 5 / vencer dia 15.
    const cycles: CycleRule[] = [
      { closingDay: 5, dueDay: 15, effectiveFrom: new Date("2026-07-01T00:00:00-03:00") },
    ];

    // 20/ago, bem depois da troca -> ciclo aberto já usa a regra nova (fecha dia 5).
    const refDate = new Date("2026-08-20T12:00:00-03:00");
    const openCycle = cycleContaining(cycles, fallback, refDate);

    const closedCycle = previousClosedCycle(cycles, fallback, openCycle);

    expect(closedCycle.periodEnd.getTime()).toBe(openCycle.periodStart.getTime());

    const { year, month } = calendarPartsSP(openCycle.periodStart);
    const expected = cycleForClosingMonth(cycles, fallback, year, month);
    expect(closedCycle).toEqual(expected);
  });
});
