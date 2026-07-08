import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Prisma } from "@/generated/prisma/client";
import { TIMEZONE } from "@/lib/date/timezone";
import { monthlyRate, monthsEarly, presentValue } from "./interest";
import { LoanAlreadySettledError, LoanPaymentDateAfterNextDueDateError, LoanAdvanceCountOutOfRangeError } from "./errors";
import type { Loan, LoanInstallmentRow, Money } from "./types";
import type { SimulateAmortizationInput } from "./schemas";

/**
 * Simulador de antecipação de parcelas — modelo C6 "Antecipar parcelas"
 * (ajuste de spec do dono, substitui a versão anterior "amortizar
 * valor/reduzir prazo/reduzir parcela"). Funções PURAS: só recebem o
 * empréstimo + as parcelas já carregadas e devolvem o resultado calculado,
 * NUNCA gravam nada (quem grava é `amortization.ts` `executeAmortization`).
 * Reusa inteiramente `interest.ts` (`monthlyRate`/`monthsEarly`/
 * `presentValue`) — sem duplicar a matemática de juros/valor presente.
 *
 * Modelo (ver mensagem do dono, tela real do C6):
 * - `order: "next"` + `count: N` — antecipa as N PRÓXIMAS parcelas não
 *   pagas (as mais próximas do vencimento). Fica sem pagar os próximos N
 *   meses; como as parcelas RESTANTES (as mais distantes, incluindo a
 *   última) não são tocadas, a data fim do contrato NÃO muda — só o nº de
 *   parcelas restantes cai.
 * - `order: "last"` + `count: N` — antecipa as N ÚLTIMAS parcelas não pagas
 *   (as mais distantes do vencimento, incluindo a que fecha o contrato).
 *   Reduz o prazo: a data fim antecipa em N meses. Desconto de juros maior
 *   que "next" pra um mesmo N (parcelas mais distantes descontam mais em
 *   `presentValue`).
 * - `type: "full"` — antecipa TODAS as parcelas não pagas de uma vez
 *   (quitação). Tratado como o mesmo caminho de seleção acima com
 *   `selected = unpaid` inteiro — sem branch especial: depois de selecionar
 *   tudo, o "depois" (`after`) naturalmente fica zerado.
 *
 * Todas as parcelas (`installments`) recebidas devem ser as `Transaction`
 * `type=EXPENSE` do empréstimo, ORDENADAS por `date asc` (mesma ordem que
 * `repository.ts` já devolve) — o NÚMERO de cada parcela (`parcela X/N` na
 * descrição, ver `installments.ts` `createLoan`) é derivado da posição
 * nesse array (paga + não paga), não de uma coluna própria (o model `Loan`/
 * `Transaction` não tem `installmentNumber` — só `InstallmentPurchase`,
 * cartão, tem).
 */

/** Recorte do `Loan` que o simulador precisa — `id` só pra contexto de erro, resto é o mesmo insumo de `interest.ts` `monthlyRate`. */
export type SimulationLoanInput = Pick<Loan, "id" | "interestRate" | "interestPeriod">;

type NumberedInstallment = LoanInstallmentRow & { number: number };

/** Saldo (nominal + valor presente) de um conjunto de parcelas não pagas — mesmo shape pro "antes" e o "depois" (`before`/`after` do resultado). */
export type LoanAmortizationBalance = {
  nominal: Money;
  presentValue: Money;
  installmentsCount: number;
  /** Vencimento da última parcela do conjunto — `null` quando não sobra nenhuma (empréstimo quitado). */
  endDate: Date | null;
};

/** Parcelas selecionadas pra antecipar nesta simulação (a resposta bate com a tela do C6: "Parcelas"). */
export type LoanAmortizationInstallments = {
  count: number;
  ids: string[];
  numbers: number[];
  dates: Date[];
};

/** Resultado do simulador — "antes → depois" pro modal de confirmação + os campos que a tela do C6 mostra (Parcelas/Desconto de juros/Total a pagar/Período). */
export type LoanAmortizationSimulation = {
  /** Vencimento da próxima parcela não paga — limite de `paymentDate` (regra do C6). */
  nextDueDate: Date;
  installments: LoanAmortizationInstallments;
  interestDiscount: Money;
  totalToPayToday: Money;
  period: { start: Date; end: Date };
  before: LoanAmortizationBalance;
  after: LoanAmortizationBalance;
};

/** Numera cada parcela pela posição no array (assume `installments` ordenado por `date asc`, paga + não paga — mesma numeração de "parcela X/N" na descrição). */
function numberInstallments(installments: LoanInstallmentRow[]): NumberedInstallment[] {
  return installments.map((installment, index) => ({ ...installment, number: index + 1 }));
}

/** Regra do C6: "Escolha uma data até o vencimento da próxima parcela" — `paymentDate` no mesmo dia do vencimento (ou antes) é permitido, depois não. */
function assertPaymentDateAllowed(paymentDate: Date, nextDueDate: Date): void {
  const zonedPayment = toZonedTime(paymentDate, TIMEZONE);
  const zonedDue = toZonedTime(nextDueDate, TIMEZONE);

  if (differenceInCalendarDays(zonedDue, zonedPayment) < 0) {
    throw new LoanPaymentDateAfterNextDueDateError({
      paymentDate: paymentDate.toISOString(),
      nextDueDate: nextDueDate.toISOString(),
    });
  }
}

/** Dropdown do front vai de 1 até o nº de parcelas não pagas restantes — reavaliado aqui contra o estado REAL (nunca confiar no `count` do client). */
function assertCountInRange(count: number, remainingCount: number): void {
  if (count < 1 || count > remainingCount) {
    throw new LoanAdvanceCountOutOfRangeError({ count, remainingCount });
  }
}

/**
 * `order: "next"` = as N primeiras do array ascendente (mais próximas do
 * vencimento). `order: "last"` = as N últimas (mais distantes, incluem a
 * parcela que fecha o contrato).
 */
function selectInstallmentsToAdvance(
  unpaid: NumberedInstallment[],
  order: "next" | "last",
  count: number,
): NumberedInstallment[] {
  return order === "last" ? unpaid.slice(-count) : unpaid.slice(0, count);
}

/** "full" seleciona TODAS as não pagas; "advance" valida `count` e seleciona pela ordem pedida. */
function resolveSelection(unpaid: NumberedInstallment[], params: SimulateAmortizationInput): NumberedInstallment[] {
  if (params.type === "full") return unpaid;

  assertCountInRange(params.count, unpaid.length);
  return selectInstallmentsToAdvance(unpaid, params.order, params.count);
}

/** Soma de `Money` sem passar por float — mesmo padrão de `interest.ts` `distributeProportionally`/`service.ts` `deriveLoanProgress`. */
function sumMoney(values: Money[]): Money {
  return values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
}

/** Soma de valores presentes de um conjunto de parcelas, na mesma `paymentDate`/taxa — insumo de `buildBalance` (antes/depois) e do total selecionado. */
function sumPresentValues(installments: NumberedInstallment[], rate: Money | null, paymentDate: Date): Money {
  const values = installments.map((installment) => presentValue(installment.amount, rate, monthsEarly(paymentDate, installment.date)));
  return sumMoney(values);
}

function sumNominal(installments: NumberedInstallment[]): Money {
  return sumMoney(installments.map((installment) => installment.amount));
}

/** Monta `before`/`after` com o MESMO shape — nominal (contratual) + valor presente (quitação hoje) + nº restante + data fim. */
function buildBalance(installments: NumberedInstallment[], rate: Money | null, paymentDate: Date): LoanAmortizationBalance {
  return {
    nominal: sumNominal(installments),
    presentValue: sumPresentValues(installments, rate, paymentDate),
    installmentsCount: installments.length,
    endDate: installments.length > 0 ? installments[installments.length - 1].date : null,
  };
}

/**
 * Simula a antecipação — NÃO grava nada. `loan.id` sem parcela não paga
 * nenhuma (já totalmente quitado) reusa `LoanAlreadySettledError` (mesmo
 * código de `settleLoan`, mesmo motivo: nada pra antecipar/quitar).
 */
export function simulateAmortization(
  loan: SimulationLoanInput,
  installments: LoanInstallmentRow[],
  params: SimulateAmortizationInput,
): LoanAmortizationSimulation {
  const numbered = numberInstallments(installments);
  const unpaid = numbered.filter((installment) => !installment.isPaid);
  if (unpaid.length === 0) throw new LoanAlreadySettledError(loan.id);

  const nextDueDate = unpaid[0].date;
  assertPaymentDateAllowed(params.paymentDate, nextDueDate);

  const selected = resolveSelection(unpaid, params);
  const selectedIds = new Set(selected.map((installment) => installment.id));
  const remaining = unpaid.filter((installment) => !selectedIds.has(installment.id));

  const rate = monthlyRate(loan);
  const totalToPayToday = sumPresentValues(selected, rate, params.paymentDate);
  const interestDiscount = sumNominal(selected).minus(totalToPayToday);

  return {
    nextDueDate,
    installments: {
      count: selected.length,
      ids: selected.map((installment) => installment.id),
      numbers: selected.map((installment) => installment.number),
      dates: selected.map((installment) => installment.date),
    },
    interestDiscount,
    totalToPayToday,
    period: { start: selected[0].date, end: selected[selected.length - 1].date },
    before: buildBalance(unpaid, rate, params.paymentDate),
    after: buildBalance(remaining, rate, params.paymentDate),
  };
}
