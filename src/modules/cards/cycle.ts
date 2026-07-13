import { addMonths, lastDayOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { parseInSaoPaulo, TIMEZONE } from "@/lib/date/timezone";

/**
 * Funções puras de cálculo de ciclo de fatura (docs/22-CREDIT_CARDS.md,
 * "Lógica de Fatura" + "Como funciona a fatura"). Sem I/O — toda leitura de
 * Transaction/CardCycle fica no repository/service. Isolado num arquivo
 * próprio (não em service.ts) porque é a peça mais delicada do módulo
 * (timezone + virada de mês + troca de ciclo ao longo do tempo) e merece ser
 * testável/lida isoladamente.
 */

export type CardCycle = {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
};

/**
 * Uma mudança de ciclo (fechamento/vencimento) vigente a partir de uma data —
 * espelha o model `CardCycle` do Prisma, mas em formato solto (sem `id`/
 * `cardId`/`createdAt`) pra manter este arquivo livre de dependência de
 * schema/ORM.
 */
export type CycleRule = { closingDay: number; dueDay: number; effectiveFrom: Date };

/**
 * Ciclo legado (`Card.closingDay`/`Card.dueDay`) usado quando nenhum
 * `CycleRule` está vigente na data de referência — inclui o caso de um
 * cartão sem nenhum `CardCycle` cadastrado (comportamento 100% atual,
 * zero regressão).
 */
export type CycleFallback = { closingDay: number; dueDay: number };

/**
 * Clampa o dia informado (`closingDay`/`dueDay`, 1-31) ao último dia real do
 * mês/ano — evita que "31 de fevereiro" role para março (docs/22: dias 1-31
 * nem sempre existem no mês).
 */
function clampDayToMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = lastDayOfMonth(new Date(year, monthIndex, 1)).getDate();
  return Math.min(day, lastDay);
}

/**
 * Meia-noite de America/Sao_Paulo do dia informado, já convertida para o
 * instante UTC correspondente (docs/22: "todo cálculo de ciclo/fatura usa
 * esses dias interpretados em America/Sao_Paulo — nunca UTC puro").
 */
function saoPauloMidnight(year: number, monthIndex: number, day: number): Date {
  const clampedDay = clampDayToMonth(year, monthIndex, day);
  return parseInSaoPaulo(new Date(year, monthIndex, clampedDay, 0, 0, 0, 0));
}

function closingDateAt(year: number, monthIndex: number, closingDay: number): Date {
  return saoPauloMidnight(year, monthIndex, closingDay);
}

/**
 * Regra (`closingDay`/`dueDay`) vigente no instante `at`: o `CycleRule` com
 * maior `effectiveFrom <= at`, ou `fallback` se nenhum se aplica ainda
 * (inclusive quando `cycles` está vazio). Comparação por instante absoluto
 * (`getTime()`) — não precisa de conversão de timezone aqui, já que
 * `effectiveFrom` é o mesmo tipo de instante UTC-equivalente usado no resto
 * do módulo.
 */
function resolveRuleAt(cycles: CycleRule[], fallback: CycleFallback, at: Date): CycleFallback {
  let chosen: CycleFallback = fallback;
  let chosenEffectiveFrom = Number.NEGATIVE_INFINITY;

  for (const cycle of cycles) {
    const effectiveFrom = cycle.effectiveFrom.getTime();
    if (effectiveFrom <= at.getTime() && effectiveFrom > chosenEffectiveFrom) {
      chosenEffectiveFrom = effectiveFrom;
      chosen = { closingDay: cycle.closingDay, dueDay: cycle.dueDay };
    }
  }

  return chosen;
}

/**
 * Regra vigente para o ciclo que fecha no mês `monthIndex`/`year` — usa o
 * dia 15 daquele mês como âncora de comparação (assume no máximo 1 troca de
 * ciclo por mês, que é a expectativa real de uso: ninguém muda
 * fechamento/vencimento do cartão duas vezes no mesmo mês). Evita
 * circularidade (pra saber o `closingDay` seria preciso já saber o
 * `closingDay`) sem precisar de timezone exato — meio do mês dá margem de
 * sobra pra qualquer `effectiveFrom` plausível (ex.: sempre no dia 1).
 */
function ruleForMonth(
  cycles: CycleRule[],
  fallback: CycleFallback,
  year: number,
  monthIndex: number,
): CycleFallback {
  const anchor = saoPauloMidnight(year, monthIndex, 15);
  return resolveRuleAt(cycles, fallback, anchor);
}

/**
 * Vencimento da fatura cujo fechamento é `periodEnd` (ano/mês informados).
 * docs/22-CREDIT_CARDS.md não define explicitamente a defasagem entre
 * `closingDay` e `dueDay` — assumido o padrão de mercado (nenhuma ambiguidade
 * a mais que já não exista no doc-fonte): se `dueDay > closingDay`, o
 * vencimento cai no MESMO mês do fechamento (ex.: fecha dia 10, vence dia 17,
 * mesma quinzena); caso contrário (`dueDay <= closingDay`), o vencimento cai
 * no mês SEGUINTE ao fechamento (ex.: fecha dia 25, vence dia 5 do mês
 * seguinte).
 */
function dueDateForClosing(
  periodEndYear: number,
  periodEndMonthIndex: number,
  closingDay: number,
  dueDay: number,
): Date {
  if (dueDay > closingDay) {
    return saoPauloMidnight(periodEndYear, periodEndMonthIndex, dueDay);
  }

  const nextMonth = addMonths(new Date(periodEndYear, periodEndMonthIndex, 1), 1);
  return saoPauloMidnight(nextMonth.getFullYear(), nextMonth.getMonth(), dueDay);
}

/**
 * Ciclo (fatura aberta) que contém `refDate` (docs/22-CREDIT_CARDS.md, "Como
 * funciona a fatura"): uma compra pertence ao ciclo quando
 * `data >= fechamento anterior && data < fechamento atual`. Consequência
 * direta dessa regra: uma compra feita NO PRÓPRIO dia de fechamento já
 * pertence ao PRÓXIMO ciclo (o fechamento é tratado como o instante de
 * meia-noite SP daquele dia — a comparação `< fechamento atual` já exclui o
 * próprio dia).
 *
 * Suporta troca de ciclo ao longo do tempo via `cycles` (histórico de
 * `CardCycle`, ver docs/22-CREDIT_CARDS.md): cada mês resolve sua PRÓPRIA
 * regra vigente (`ruleForMonth`) antes de calcular o dia de fechamento —
 * `cycles` vazio reduz exatamente ao comportamento legado (usa `fallback`
 * pra tudo, zero regressão).
 *
 * DECISÃO da fatura de TRANSIÇÃO (mês em que o ciclo muda no meio do
 * período): `periodEnd` usa a regra vigente no MÊS DE FECHAMENTO (a nova,
 * já em vigor quando a fatura fecha) e `periodStart` usa a regra vigente no
 * mês anterior (a antiga, ainda vigente quando aquele ciclo abriu). O
 * `dueDate` segue a regra de `periodEnd` (é o vencimento da fatura que
 * efetivamente fechou sob a regra nova). Resultado: essa única fatura pode
 * ficar mais curta ou mais longa que 1 mês — é o preço de um cartão
 * realmente ter mudado de dia de fechamento, não um bug.
 */
export function cycleContaining(cycles: CycleRule[], fallback: CycleFallback, refDate: Date): CardCycle {
  const zonedRef = toZonedTime(refDate, TIMEZONE);
  const year = zonedRef.getFullYear();
  const monthIndex = zonedRef.getMonth();

  const thisMonthRule = ruleForMonth(cycles, fallback, year, monthIndex);
  const thisMonthClosing = closingDateAt(year, monthIndex, thisMonthRule.closingDay);

  let periodEndYear = year;
  let periodEndMonthIndex = monthIndex;
  let periodEnd = thisMonthClosing;

  if (refDate.getTime() >= thisMonthClosing.getTime()) {
    const nextMonth = addMonths(new Date(year, monthIndex, 1), 1);
    periodEndYear = nextMonth.getFullYear();
    periodEndMonthIndex = nextMonth.getMonth();
    const nextMonthRule = ruleForMonth(cycles, fallback, periodEndYear, periodEndMonthIndex);
    periodEnd = closingDateAt(periodEndYear, periodEndMonthIndex, nextMonthRule.closingDay);
  }

  const previousMonth = addMonths(new Date(periodEndYear, periodEndMonthIndex, 1), -1);
  const previousMonthRule = ruleForMonth(cycles, fallback, previousMonth.getFullYear(), previousMonth.getMonth());
  const periodStart = closingDateAt(
    previousMonth.getFullYear(),
    previousMonth.getMonth(),
    previousMonthRule.closingDay,
  );

  const periodEndRule = ruleForMonth(cycles, fallback, periodEndYear, periodEndMonthIndex);
  const dueDate = dueDateForClosing(periodEndYear, periodEndMonthIndex, periodEndRule.closingDay, periodEndRule.dueDay);

  return { periodStart, periodEnd, dueDate };
}

/**
 * Ciclo identificado pelo mês/ano em que o FECHAMENTO ocorre (`month` 1-12).
 * Usado por `invoiceFor` para consultar uma fatura específica (passada ou
 * futura), fora do ciclo "aberto" atual.
 *
 * Mesma troca de ciclo e mesma decisão de fatura de TRANSIÇÃO documentadas em
 * `cycleContaining` (acima): `periodEnd`/`dueDate` usam a regra vigente no
 * mês de fechamento informado, `periodStart` usa a regra vigente no mês
 * anterior. `cycles` vazio reduz ao comportamento legado.
 */
export function cycleForClosingMonth(
  cycles: CycleRule[],
  fallback: CycleFallback,
  year: number,
  month: number,
): CardCycle {
  const monthIndex = month - 1;

  const periodEndRule = ruleForMonth(cycles, fallback, year, monthIndex);
  const periodEnd = closingDateAt(year, monthIndex, periodEndRule.closingDay);

  const previousMonth = addMonths(new Date(year, monthIndex, 1), -1);
  const previousMonthRule = ruleForMonth(cycles, fallback, previousMonth.getFullYear(), previousMonth.getMonth());
  const periodStart = closingDateAt(
    previousMonth.getFullYear(),
    previousMonth.getMonth(),
    previousMonthRule.closingDay,
  );

  const dueDate = dueDateForClosing(year, monthIndex, periodEndRule.closingDay, periodEndRule.dueDay);

  return { periodStart, periodEnd, dueDate };
}

/**
 * Ciclo imediatamente ANTERIOR a `openCycle` — a fatura que JÁ FECHOU e está
 * aguardando pagamento, distinta de `cycleContaining(now)` (ciclo ABERTO,
 * ainda em formação). Ver "achado central" em
 * `docs/superpowers/specs/2026-07-13-cartao-vencimento-fatura-status-design.md`:
 * `invoiceDueDate`/`currentInvoice` só refletem "a fatura que devo pagar
 * agora" durante a JANELA entre o vencimento e o próximo fechamento — na
 * maior parte do mês eles já apontam pro ciclo seguinte.
 *
 * Cálculo: 1ms antes do início de `openCycle` cai, por definição, dentro do
 * ciclo anterior — reaproveita `cycleContaining` sem escrever data-math nova.
 */
export function previousClosedCycle(cycles: CycleRule[], fallback: CycleFallback, openCycle: CardCycle): CardCycle {
  return cycleContaining(cycles, fallback, new Date(openCycle.periodStart.getTime() - 1));
}
