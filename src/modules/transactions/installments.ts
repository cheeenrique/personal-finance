import { addMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db/client";
import { TransactionType } from "@/generated/prisma/enums";
import { parseInSaoPaulo, TIMEZONE } from "@/lib/date/timezone";
import { assertCardOwnership, assertCategoryOwnership } from "./service";
import { InstallmentInvalidCountError } from "./errors";
import type { CreateInstallmentPurchaseInput } from "./schemas";
import type { InstallmentPurchaseResult } from "./types";

const MIN_INSTALLMENTS = 2;

/** Converte "123.45" em 12345 (centavos), sem passar por float — evita erro de arredondamento. */
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
 * Rateio de centavos (docs/23-INSTALLMENTS.md, "Rateio do Valor Total"):
 * todas as parcelas recebem `floor(total/n)`, a ÚLTIMA absorve o resto.
 * Soma das parcelas sempre bate exatamente com `totalAmount`.
 */
function splitInstallmentAmounts(totalAmount: string, installmentsCount: number): string[] {
  const totalCents = decimalToCents(totalAmount);
  const baseCents = Math.floor(totalCents / installmentsCount);
  const lastCents = totalCents - baseCents * (installmentsCount - 1);

  return Array.from({ length: installmentsCount }, (_, index) =>
    centsToDecimal(index === installmentsCount - 1 ? lastCents : baseCents),
  );
}

/**
 * Vencimento de cada parcela = `firstDueDate` + (n-1) meses, respeitando o
 * calendário de America/Sao_Paulo (não UTC — evita parcela "vazar" pro mês
 * errado perto da virada do dia). `toZonedTime` + `addMonths` operam sobre os
 * getters locais do Date; `parseInSaoPaulo` (fromZonedTime) os reinterpreta
 * como horário de SP na volta — cadeia correta independente do timezone do host.
 */
function installmentDueDate(firstDueDate: Date, installmentNumber: number): Date {
  const zonedFirstDueDate = toZonedTime(firstDueDate, TIMEZONE);
  const zonedDueDate = addMonths(zonedFirstDueDate, installmentNumber - 1);
  return parseInSaoPaulo(zonedDueDate);
}

/**
 * Cria a compra parcelada + as N Transactions (parcelas) atomicamente
 * (docs/23-INSTALLMENTS.md, "Fluxo de Criação"). Cada parcela nasce
 * `isPaid=true` (mesma regra de compra confirmada no cartão) e soma exata
 * com `totalAmount` (rateio de centavos absorvido na última parcela).
 *
 * Escritas sequenciais dentro do `$transaction` interativo — Prisma não
 * garante segurança de queries concorrentes no mesmo client de transação.
 */
export async function createInstallmentPurchase(
  userId: string,
  input: CreateInstallmentPurchaseInput,
): Promise<InstallmentPurchaseResult> {
  if (input.installmentsCount < MIN_INSTALLMENTS) {
    throw new InstallmentInvalidCountError(input.installmentsCount);
  }

  await assertCardOwnership(userId, input.cardId);
  await assertCategoryOwnership(userId, input.categoryId, TransactionType.EXPENSE);

  const amounts = splitInstallmentAmounts(input.totalAmount, input.installmentsCount);

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.installmentPurchase.create({
      data: {
        userId,
        cardId: input.cardId,
        description: input.description,
        totalAmount: input.totalAmount,
        installmentsCount: input.installmentsCount,
        firstDueDate: input.firstDueDate,
      },
    });

    const transactions = [];
    for (let index = 0; index < input.installmentsCount; index += 1) {
      const installmentNumber = index + 1;
      // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, ver JSDoc acima
      const transaction = await tx.transaction.create({
        data: {
          userId,
          description: input.description,
          type: TransactionType.EXPENSE,
          amount: amounts[index],
          categoryId: input.categoryId,
          cardId: input.cardId,
          date: installmentDueDate(input.firstDueDate, installmentNumber),
          isPaid: true,
          installmentPurchaseId: purchase.id,
          installmentNumber,
        },
        include: { transactionTags: true },
      });
      transactions.push(transaction);
    }

    return { installmentPurchaseId: purchase.id, transactions };
  });
}
