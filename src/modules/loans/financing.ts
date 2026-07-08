import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { LoanKind, AmortizationSystem } from "@/generated/prisma/enums";
import { assertAccountOwnership, assertCategoryOwnership, assertAssetOwnership } from "./service";
import { monthlyRate } from "./interest";
import {
  decimalToCents,
  centsToDecimal,
  splitLoanInstallmentAmounts,
  installmentDueDate,
  insertInstallmentTransaction,
} from "./installments";
import { LoanInstallmentMismatchError } from "./errors";
import type { CreateFinancingInput } from "./schemas";
import type { CreateLoanResult } from "./types";

/**
 * Financiamento (`Loan.kind=FINANCING`, docs/50-AUDITORIA-BACKLOG.md) — Stage
 * 1: fundação de dados + geração de parcelas por sistema de amortização
 * (PRICE/SAC/CUSTOM). Decisão do dono: estende `Loan` via `kind`, não um
 * módulo novo — arquivo PRÓPRIO (não `installments.ts`) só por tamanho (rule
 * 05-naming-size.md: `installments.ts` já estava no limite antes desta
 * feature, ver JSDoc de `update.ts` `updateLoan`); reusa os helpers de lá
 * (`splitLoanInstallmentAmounts`, `installmentDueDate`,
 * `insertInstallmentTransaction`, `decimalToCents`/`centsToDecimal`) via
 * import, sem duplicar.
 */

/** Soma de valores monetários (string) em CENTAVOS, sem passar por float — mesma técnica de `decimalToCents`/`centsToDecimal` (`installments.ts`). */
function sumAmounts(amounts: string[]): string {
  const totalCents = amounts.reduce((sum, amount) => sum + decimalToCents(amount), 0);
  return centsToDecimal(totalCents);
}

/**
 * Cronograma SAC (Sistema de Amortização Constante) — decrescente, a partir
 * do `principal` e da taxa mensal já resolvida (`interest.ts` `monthlyRate`,
 * fração — ex. `0.0179` para 1,79% a.m.). Diferente da PRICE
 * (`installments.ts` `splitLoanInstallmentAmounts`, onde o valor de cada
 * parcela já é dado), aqui cada parcela é CALCULADA: amortização constante =
 * `principal / N` (arredondada pra baixo em centavos — `Math.trunc`, nunca
 * `Math.round`, pra não fechar acima do principal); a última parcela
 * amortiza o SALDO remanescente inteiro (não a fração truncada), fechando a
 * soma das amortizações em EXATAMENTE `principal`, sem resíduo de
 * arredondamento espalhado.
 *
 * Juros de cada parcela = `saldo_{k-1} * taxaMensal`, arredondado pra 2 casas
 * (`ROUND_HALF_UP`) SÓ nesse passo — igual à convenção de `interest.ts`
 * `presentValue` (arredonda só o resultado final de cada operação, nunca
 * intermediário). Trabalha inteiramente em CENTAVOS: `saldoCents * taxa`
 * já dá o juros em centavos diretamente (`saldoReais * taxa * 100 ==
 * saldoCents * taxa`), sem conversão extra.
 *
 * `parcela_k = amortização_k + juros_k` — decrescente porque o saldo
 * decresce e a amortização é constante. Retorna só os valores (mesmo
 * contrato de `splitLoanInstallmentAmounts`); `buildFinancingSchedule` casa
 * cada valor com sua data de vencimento.
 */
export function generateSacInstallmentAmounts(
  principal: string,
  rate: Prisma.Decimal,
  installmentsCount: number,
): string[] {
  const totalCents = decimalToCents(principal);
  const baseAmortizationCents = Math.trunc(totalCents / installmentsCount);

  let balanceCents = totalCents;
  const amountsCents: number[] = [];

  for (let index = 0; index < installmentsCount; index += 1) {
    const isLast = index === installmentsCount - 1;
    const amortizationCents = isLast ? balanceCents : baseAmortizationCents;
    const interestCents = new Prisma.Decimal(balanceCents)
      .times(rate)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();

    amountsCents.push(amortizationCents + interestCents);
    balanceCents -= amortizationCents;
  }

  return amountsCents.map((cents) => centsToDecimal(cents));
}

/**
 * Valida o cronograma CUSTOM (tabela extraída de um documento do banco —
 * Stage 3/Gemini) contra `totalToPay` — tolerância de 1 centavo POR LINHA
 * (`scheduleAmounts.length` centavos no total), cobrindo arredondamento de
 * fonte externa (OCR/extração), sem mascarar um cronograma genuinamente
 * incompatível (ex.: linha faltando/duplicada, erro grosseiro de extração).
 */
function assertCustomScheduleMatchesTotal(scheduleAmounts: string[], totalToPay: string): void {
  const sumCents = scheduleAmounts.reduce((sum, amount) => sum + decimalToCents(amount), 0);
  const totalCents = decimalToCents(totalToPay);
  const toleranceCents = scheduleAmounts.length;

  if (Math.abs(sumCents - totalCents) > toleranceCents) {
    throw new LoanInstallmentMismatchError({
      totalToPay,
      sum: centsToDecimal(sumCents),
      toleranceCents,
    });
  }
}

/** Cronograma resolvido (valores + datas) + os campos derivados do `Loan` — insumo comum de `createFinancing` pros 3 sistemas. */
type FinancingSchedule = {
  installmentsCount: number;
  firstDueDate: Date;
  totalToPay: string;
  installmentAmount: string;
  amounts: string[];
  dates: Date[];
};

/**
 * Resolve o cronograma de UM financiamento conforme `amortizationSystem` —
 * ponto único de "o que fazer por sistema" (OCP: novo sistema = novo branch
 * aqui, sem tocar `createFinancing`). `installmentAmount` persistido no
 * `Loan` é sempre o valor da PRIMEIRA parcela: em PRICE é o mesmo valor de
 * todas (parcela fixa); em SAC/CUSTOM é só um retrato — a parcela real de
 * cada mês vive na `Transaction` (mesmo princípio de "Regra de Ouro",
 * docs/03-DATABASE.md: nada denormalizado que dá pra derivar, mas um
 * retrato de "primeira parcela" ainda é útil pra listagem sem juntar as
 * transactions).
 */
function buildFinancingSchedule(input: CreateFinancingInput): FinancingSchedule {
  if (input.amortizationSystem === AmortizationSystem.PRICE) {
    const amounts = splitLoanInstallmentAmounts(input.totalToPay, input.installmentAmount, input.installmentsCount);
    const dates = amounts.map((_, index) => installmentDueDate(input.firstDueDate, index + 1));

    return {
      installmentsCount: input.installmentsCount,
      firstDueDate: input.firstDueDate,
      totalToPay: input.totalToPay,
      installmentAmount: input.installmentAmount,
      amounts,
      dates,
    };
  }

  if (input.amortizationSystem === AmortizationSystem.SAC) {
    // Schema exige interestRate+interestPeriod juntos pra SAC — `monthlyRate` nunca retorna `null` aqui.
    const rate = monthlyRate({
      interestRate: new Prisma.Decimal(input.interestRate),
      interestPeriod: input.interestPeriod,
    }) as Prisma.Decimal;

    const amounts = generateSacInstallmentAmounts(input.principal, rate, input.installmentsCount);
    const dates = amounts.map((_, index) => installmentDueDate(input.firstDueDate, index + 1));

    return {
      installmentsCount: input.installmentsCount,
      firstDueDate: input.firstDueDate,
      totalToPay: sumAmounts(amounts),
      installmentAmount: amounts[0],
      amounts,
      dates,
    };
  }

  // CUSTOM — cronograma explícito, usado como veio (nunca recalculado).
  const amounts = input.schedule.map((item) => item.amount);
  const dates = input.schedule.map((item) => item.dueDate);
  const totalToPay = input.totalToPay ?? sumAmounts(amounts);
  assertCustomScheduleMatchesTotal(amounts, totalToPay);

  return {
    installmentsCount: amounts.length,
    firstDueDate: dates[0],
    totalToPay,
    installmentAmount: amounts[0],
    amounts,
    dates,
  };
}

/**
 * Cria um FINANCIAMENTO (`Loan.kind=FINANCING`) + as N `Transaction`s
 * (parcelas) atomicamente — kind-aware sobre o mesmo mecanismo de
 * `installments.ts` `createLoan` (mesma `$transaction`, mesma forma de
 * parcela: EXPENSE, `isPaid=false`, `loanId` preenchido). Diferença: o
 * cronograma vem de `buildFinancingSchedule` (PRICE reusa
 * `splitLoanInstallmentAmounts`; SAC/CUSTOM têm lógica própria — ver ali), e
 * o `Loan` grava os campos específicos de financiamento (entrada, valor do
 * bem, sistema de amortização, CET, custos embutidos) — todos `null` em
 * empréstimo comum, nunca preenchidos aqui.
 *
 * `assetId` (opcional) validado por ownership como `accountId`/`categoryId`
 * — nunca linka um `Asset` de outro usuário mesmo sabendo o id.
 */
export async function createFinancing(userId: string, input: CreateFinancingInput): Promise<CreateLoanResult> {
  await assertAccountOwnership(userId, input.accountId);
  if (input.categoryId) await assertCategoryOwnership(userId, input.categoryId);
  if (input.assetId) await assertAssetOwnership(userId, input.assetId);

  const categoryId = input.categoryId ?? null;
  const schedule = buildFinancingSchedule(input);

  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        userId,
        description: input.description,
        lender: input.lender ?? null,
        principal: input.principal,
        totalToPay: schedule.totalToPay,
        installmentsCount: schedule.installmentsCount,
        installmentAmount: schedule.installmentAmount,
        firstDueDate: schedule.firstDueDate,
        accountId: input.accountId,
        categoryId,
        interestRate: input.interestRate ?? null,
        interestPeriod: input.interestPeriod ?? null,
        kind: LoanKind.FINANCING,
        amortizationSystem: input.amortizationSystem,
        downPayment: input.downPayment ?? null,
        assetValue: input.assetValue ?? null,
        assetId: input.assetId ?? null,
        cet: input.cet ?? null,
        operationRef: input.operationRef ?? null,
        financedTaxes: input.financedTaxes ?? null,
        financedInsurance: input.financedInsurance ?? null,
        financedFees: input.financedFees ?? null,
      },
    });

    const transactions = [];
    for (let index = 0; index < schedule.amounts.length; index += 1) {
      const installmentNumber = index + 1;
      const description = `${input.description} - parcela ${installmentNumber}/${schedule.amounts.length}`;
      // sequencial de propósito, ver JSDoc de `installments.ts` `createLoan` (regra no-await-in-loop não configurada neste projeto)
      const transaction = await insertInstallmentTransaction(tx, {
        userId,
        loanId: loan.id,
        accountId: input.accountId,
        categoryId,
        description,
        amount: schedule.amounts[index],
        date: schedule.dates[index],
      });
      transactions.push(transaction);
    }

    return { loan, transactions };
  });
}
