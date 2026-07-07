import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Prisma } from "@/generated/prisma/client";
import { InterestPeriod } from "@/generated/prisma/enums";
import { TIMEZONE } from "@/lib/date/timezone";
import type { Loan, Money } from "./types";

/**
 * Funções PURAS de juros do empréstimo (docs/03-DATABASE.md, model Loan) —
 * sem I/O, sem Prisma client, só `Prisma.Decimal` como tipo de valor
 * monetário (mesmo `Money` de `types.ts`). Isoladas aqui pra serem
 * testáveis sem banco (ver teste manual descrito na tarefa).
 *
 * Juros é OPCIONAL por empréstimo, default DESLIGADO (decisão do dono) —
 * `loan.interestRate`/`loan.interestPeriod` nulos em QUALQUER função deste
 * arquivo significa "sem juros configurado", nunca um erro: o resultado cai
 * pro comportamento cheio/sem desconto (mesmo comportamento do produto
 * ANTES desta feature — zero regressão pra quem não configura juros).
 */

/** Recorte do `Loan` que a matemática de juros precisa — desacopla de `LoanWithProgress`/`LoanWithTransactions` (a função não precisa do resto do empréstimo). */
export type LoanInterestFields = Pick<Loan, "interestRate" | "interestPeriod">;

/** Recorte de UMA parcela (`Transaction` EXPENSE do empréstimo) — só o que entra no cálculo de valor presente. */
export type LoanInstallmentInput = { amount: Money; date: Date };

export type EarlyPaymentSuggestion = { suggested: Money; fullAmount: Money; discount: Money };

/**
 * Dias corridos médios por mês (ano civil médio, 365.25 dias / 12 ≈ 30,4375)
 * — usado só pra converter "dias entre pagamento e vencimento" em "meses
 * fracionários" no desconto de antecipação (`monthsEarly`). Mesma convenção
 * de calculadoras de amortização (Price/SAC) quando o intervalo não cai num
 * múltiplo exato de meses.
 */
const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;

/**
 * Taxa de juros MENSAL efetiva do empréstimo, derivada de `interestRate` +
 * `interestPeriod`. `null` = sem juros configurado (default do produto) —
 * nenhum desconto de antecipação se aplica nesse caso (ver `presentValue`).
 *
 * `MONTHLY`: a taxa configurada já É a mensal, só normaliza de "56,227" (%)
 * pra "0,56227" (fração).
 *
 * `ANNUAL`: taxa efetiva ao ano → mensal via equivalência de JUROS
 * COMPOSTOS (nunca dividir por 12 — isso seria juros simples e subestima a
 * taxa real): `i_mensal = (1 + i_anual)^(1/12) - 1`.
 *
 * Precisão: usa `Prisma.Decimal.toPower` com expoente FRACIONÁRIO (`1/12`).
 * A implementação de `Decimal.pow` (decimal.js, a lib por trás de
 * `Prisma.Decimal` — ver node_modules/@prisma/client-runtime-utils)
 * resolve expoente não-inteiro internamente via `exp(y * ln(x))`, mantendo
 * a precisão configurada da lib (20 dígitos significativos por padrão) —
 * NUNCA passa por `Number`/IEEE-754 nesse caminho, então é mais preciso que
 * a alternativa "Number pra pow" sugerida na tarefa (que também seria
 * aceitável, mas essa é estritamente melhor e ainda é só uma chamada).
 */
export function monthlyRate(loan: LoanInterestFields): Money | null {
  if (!loan.interestRate || !loan.interestPeriod) return null;

  const rate = loan.interestRate.dividedBy(100);
  if (loan.interestPeriod === InterestPeriod.MONTHLY) return rate;

  return new Prisma.Decimal(1).plus(rate).toPower(new Prisma.Decimal(1).dividedBy(12)).minus(1);
}

/**
 * Quantos meses (fração incluída) o pagamento antecipa o vencimento —
 * insumo de `presentValue`. Conta dias corridos entre `paymentDate` e
 * `dueDate` em America/Sao_Paulo (docs/01-STACK.md, timezone fixo em todo
 * cálculo de negócio) e converte pra meses via `AVERAGE_DAYS_PER_MONTH`.
 *
 * Pagamento NO vencimento ou depois (`paymentDate >= dueDate`) → `0`, nunca
 * negativo — não existe "antecipação negativa" no domínio, e `0` já sinaliza
 * pra `presentValue` "sem desconto, valor cheio".
 */
export function monthsEarly(paymentDate: Date, dueDate: Date): number {
  const zonedPayment = toZonedTime(paymentDate, TIMEZONE);
  const zonedDue = toZonedTime(dueDate, TIMEZONE);
  const daysEarly = differenceInCalendarDays(zonedDue, zonedPayment);

  return daysEarly > 0 ? daysEarly / AVERAGE_DAYS_PER_MONTH : 0;
}

/**
 * Valor presente de `amount` pago `monthsEarly` meses antes do vencimento,
 * descontado pela taxa mensal `rate` — desconto composto padrão:
 * `amount / (1 + rate)^monthsEarly`.
 *
 * Sem juros (`rate === null`) OU sem antecipação real (`monthsEarly <= 0`)
 * → valor CHEIO, sem desconto algum (comportamento atual do produto antes
 * desta feature intacto — ver "Cuidados" da tarefa, zero regressão).
 *
 * Arredonda pra 2 casas (`ROUND_HALF_UP`, convenção de dinheiro do projeto —
 * docs/03-DATABASE.md, `Decimal(12,2)`) só no resultado FINAL, nunca nos
 * passos intermediários (fator de desconto fica com a precisão cheia da
 * lib).
 */
export function presentValue(amount: Money, rate: Money | null, monthsEarlyValue: number): Money {
  if (!rate || monthsEarlyValue <= 0) return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const discountFactor = new Prisma.Decimal(1).plus(rate).toPower(monthsEarlyValue);
  return amount.dividedBy(discountFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Sugestão de antecipação pra UMA parcela — insumo do fluxo "marcar parcela
 * paga antes do vencimento" (o front mostra isso como PONTO DE PARTIDA
 * editável, nunca como valor travado — decisão do dono confirmada na
 * tarefa: "antecipação auto-sugere o valor com desconto, mas o usuário edita
 * livre"). Quem CONFIRMA o valor final e grava é o caller (`updateTransactionAction`
 * reusado — ver service.ts `suggestEarlyPayment` e o JSDoc de por que este
 * módulo NÃO grava nada, só sugere).
 */
export function earlyPaymentSuggestion(
  loan: LoanInterestFields,
  installment: LoanInstallmentInput,
  paymentDate: Date,
): EarlyPaymentSuggestion {
  const fullAmount = installment.amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const rate = monthlyRate(loan);
  const early = monthsEarly(paymentDate, installment.date);
  const suggested = presentValue(installment.amount, rate, early);

  return { suggested, fullAmount, discount: fullAmount.minus(suggested) };
}

/**
 * Distribui `total` proporcionalmente aos `weights` (uma `Money` por item),
 * preservando a soma EXATA de `total` — arredonda cada parte em CENTAVOS e
 * ajusta o resíduo de arredondamento na ÚLTIMA posição (mesmo padrão de
 * `installments.ts` `splitLoanInstallmentAmounts`, só que com pesos
 * proporcionais em vez de partes iguais). Usado por `service.ts`
 * `settleLoan` pra ratear o total quitado (sugerido via `presentValue` ou
 * editado pelo usuário) entre as parcelas não pagas, proporcional ao valor
 * presente de cada uma.
 *
 * `weights` todos zero (caso degenerado, ex. parcelas de valor zero) cai
 * pra rateio igual — evita dividir por zero.
 */
export function distributeProportionally(total: Money, weights: Money[]): Money[] {
  if (weights.length === 0) return [];

  const totalCents = total.times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  const weightSum = weights.reduce((sum, weight) => sum.plus(weight), new Prisma.Decimal(0));

  const shareCents = weightSum.isZero()
    ? weights.map(() => Math.round(totalCents / weights.length))
    : weights.map((weight) =>
        Math.round(weight.dividedBy(weightSum).times(totalCents).toNumber()),
      );

  const usedCents = shareCents.slice(0, -1).reduce((sum, cents) => sum + cents, 0);
  const lastCents = totalCents - usedCents;

  return [...shareCents.slice(0, -1), lastCents].map((cents) => new Prisma.Decimal(cents).dividedBy(100));
}
