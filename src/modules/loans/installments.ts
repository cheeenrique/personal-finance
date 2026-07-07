import { addMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { parseInSaoPaulo, TIMEZONE } from "@/lib/date/timezone";
import { assertAccountOwnership, assertCategoryOwnership } from "./service";
import { LoanInstallmentMismatchError, LoanInstallmentsBelowPaidCountError } from "./errors";
import type { CreateLoanInput } from "./schemas";
import type { CreateLoanResult } from "./types";

/**
 * Converte "123.45" em 12345 (centavos), sem passar por float — evita erro de
 * arredondamento. Duplicado de `transactions/installments.ts` (2ª ocorrência,
 * aceitável — rule 02-dry-kiss-yagni, "3 ocorrências = extrair"); extrair pra
 * `lib/money/` se um 3º consumidor aparecer.
 */
function decimalToCents(amount: string): number {
  const [integerPart, decimalPart = ""] = amount.split(".");
  const cents = (decimalPart + "00").slice(0, 2);
  const sign = integerPart.startsWith("-") ? -1 : 1;
  return sign * (Number(integerPart.replace("-", "")) * 100 + Number(cents));
}

function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absoluteCents = Math.abs(cents);
  const integerPart = Math.floor(absoluteCents / 100);
  const decimalPart = String(absoluteCents % 100).padStart(2, "0");
  return `${sign}${integerPart}.${decimalPart}`;
}

/**
 * Rateio do empréstimo — diferente do rateio de compra parcelada de cartão
 * (`transactions/installments.ts` `splitInstallmentAmounts`, onde o valor da
 * parcela é DERIVADO de `totalAmount/count`): aqui `installmentAmount` já vem
 * do contrato do empréstimo. As N-1 primeiras parcelas usam esse valor cheio;
 * a ÚLTIMA absorve o resíduo (`totalToPay - installmentAmount*(N-1)`) pra
 * soma bater exatamente com `totalToPay`. Resíduo <= 0 indica
 * `installmentAmount` incompatível com `totalToPay`/`installmentsCount`
 * informados — dados de contrato inconsistentes.
 */
function splitLoanInstallmentAmounts(
  totalToPay: string,
  installmentAmount: string,
  installmentsCount: number,
): string[] {
  const totalCents = decimalToCents(totalToPay);
  const baseCents = decimalToCents(installmentAmount);
  const lastCents = totalCents - baseCents * (installmentsCount - 1);

  if (lastCents <= 0) {
    throw new LoanInstallmentMismatchError({ totalToPay, installmentAmount, installmentsCount });
  }

  return Array.from({ length: installmentsCount }, (_, index) =>
    centsToDecimal(index === installmentsCount - 1 ? lastCents : baseCents),
  );
}

/**
 * Vencimento de cada parcela = `firstDueDate` + (n-1) meses, respeitando o
 * calendário de America/Sao_Paulo — mesma lógica de
 * `transactions/installments.ts` `installmentDueDate` (ver JSDoc lá para o
 * detalhe de por que `toZonedTime`/`parseInSaoPaulo` em vez de UTC puro).
 */
function installmentDueDate(firstDueDate: Date, installmentNumber: number): Date {
  const zonedFirstDueDate = toZonedTime(firstDueDate, TIMEZONE);
  const zonedDueDate = addMonths(zonedFirstDueDate, installmentNumber - 1);
  return parseInSaoPaulo(zonedDueDate);
}

/**
 * Cria o Loan + as N Transactions (parcelas) atomicamente — mesmo padrão de
 * `transactions/installments.ts` `createInstallmentPurchase`, mas na CONTA
 * (não cartão) e com parcela nascendo `isPaid=false` (PREVISTO). Diferente da
 * compra no cartão (parcela já nasce confirmada, `isPaid=true`, "paga" =
 * `date <= hoje`), a parcela do empréstimo entra em "Previsto / A Pagar"
 * (docs/11-DASHBOARD.md) até o usuário marcar como paga manualmente (mesmo
 * fluxo de qualquer EXPENSE de conta) — refletido no progresso derivado por
 * `isPaid` real, não por data (ver service.ts `deriveLoanProgress`).
 *
 * Escritas sequenciais dentro do `$transaction` interativo — Prisma não
 * garante segurança de queries concorrentes no mesmo client de transação.
 */
export async function createLoan(userId: string, input: CreateLoanInput): Promise<CreateLoanResult> {
  await assertAccountOwnership(userId, input.accountId);
  if (input.categoryId) await assertCategoryOwnership(userId, input.categoryId);

  const categoryId = input.categoryId ?? null;
  const amounts = splitLoanInstallmentAmounts(input.totalToPay, input.installmentAmount, input.installmentsCount);

  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.create({
      data: {
        userId,
        description: input.description,
        lender: input.lender ?? null,
        principal: input.principal,
        totalToPay: input.totalToPay,
        installmentsCount: input.installmentsCount,
        installmentAmount: input.installmentAmount,
        firstDueDate: input.firstDueDate,
        accountId: input.accountId,
        categoryId,
      },
    });

    const transactions = [];
    for (let index = 0; index < input.installmentsCount; index += 1) {
      const installmentNumber = index + 1;
      const description = `${input.description} - parcela ${installmentNumber}/${input.installmentsCount}`;
      // sequencial de propósito, ver JSDoc acima (regra no-await-in-loop não configurada neste projeto)
      const transaction = await tx.transaction.create({
        data: {
          userId,
          description,
          type: TransactionType.EXPENSE,
          amount: amounts[index],
          accountId: input.accountId,
          categoryId,
          date: installmentDueDate(input.firstDueDate, installmentNumber),
          isPaid: false,
          loanId: loan.id,
        },
      });
      transactions.push(transaction);
    }

    return { loan, transactions };
  });
}

/** Insumo de `regenerateUnpaidInstallments` — só o que a regeneração precisa do Loan MESCLADO (existente + patch, já resolvido pelo caller em `update.ts` `updateLoan`) + as parcelas já pagas (mantidas intactas, nunca tocadas aqui). */
type RegenerateUnpaidInstallmentsParams = {
  userId: string;
  loanId: string;
  description: string;
  accountId: string;
  categoryId: string | null;
  totalToPay: Prisma.Decimal;
  installmentAmount: Prisma.Decimal;
  installmentsCount: number;
  firstDueDate: Date;
  paidInstallments: { amount: Prisma.Decimal }[];
};

/**
 * Regenera SÓ as parcelas NÃO pagas de um empréstimo editado (`update.ts`
 * `updateLoan`) — quando `installmentsCount`/`installmentAmount`/
 * `firstDueDate`/`totalToPay` mudam, o contrato de parcelamento original
 * (gerado por `createLoan`) fica desatualizado. Parcelas JÁ PAGAS
 * (`paidInstallments`) são fatos financeiros ocorridos — NUNCA apagadas nem
 * recriadas aqui (mesmo princípio de `service.ts` `deleteLoan`); o caller já
 * fez `softDeleteUnpaidInstallments` ANTES de chamar esta função.
 *
 * O rateio roda sobre o RESTANTE, não sobre o contrato inteiro:
 * `remainingCount` = `installmentsCount` (novo) − parcelas já pagas,
 * `remainingToPay` = `totalToPay` (novo) − soma do que já foi pago (valor
 * REAL pago, que pode ser menor que o previsto por causa de antecipação com
 * desconto — ver `interest.ts`). As novas parcelas continuam a numeração
 * (`paidCount+1` até `installmentsCount`) e usam `splitLoanInstallmentAmounts`
 * (mesma função de `createLoan` — resíduo absorvido na ÚLTIMA parcela pra
 * soma bater exato).
 *
 * `remainingCount < 0` (usuário reduziu `installmentsCount` pra menos do que
 * já foi pago) → erro: reduziria um histórico que já aconteceu.
 * `remainingCount === 0` (empréstimo já quitado pelas parcelas pagas, edição
 * não mexe na contagem) → no-op, nada pra gerar.
 */
export async function regenerateUnpaidInstallments(
  tx: Prisma.TransactionClient,
  params: RegenerateUnpaidInstallmentsParams,
): Promise<void> {
  const paidCount = params.paidInstallments.length;
  const remainingCount = params.installmentsCount - paidCount;

  if (remainingCount < 0) {
    throw new LoanInstallmentsBelowPaidCountError({ installmentsCount: params.installmentsCount, paidCount });
  }
  if (remainingCount === 0) return;

  const paidTotal = params.paidInstallments.reduce(
    (sum, installment) => sum.plus(installment.amount),
    new Prisma.Decimal(0),
  );
  const remainingToPay = params.totalToPay.minus(paidTotal);

  const amounts = splitLoanInstallmentAmounts(
    remainingToPay.toFixed(2),
    params.installmentAmount.toFixed(2),
    remainingCount,
  );

  for (let index = 0; index < remainingCount; index += 1) {
    const installmentNumber = paidCount + index + 1;
    const description = `${params.description} - parcela ${installmentNumber}/${params.installmentsCount}`;
    // sequencial de propósito, ver JSDoc de `createLoan` (regra no-await-in-loop não configurada neste projeto)
    await tx.transaction.create({
      data: {
        userId: params.userId,
        description,
        type: TransactionType.EXPENSE,
        amount: amounts[index],
        accountId: params.accountId,
        categoryId: params.categoryId,
        date: installmentDueDate(params.firstDueDate, installmentNumber),
        isPaid: false,
        loanId: params.loanId,
      },
    });
  }
}

