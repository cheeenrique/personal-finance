import { addMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db/client";
import { TransactionType } from "@/generated/prisma/enums";
import { parseInSaoPaulo, TIMEZONE } from "@/lib/date/timezone";
import { assertCardOwnership, assertCategoryOwnership } from "./service";
import { transactionRepository } from "./repository";
import { InstallmentInvalidCountError, InstallmentPurchaseNotFoundError } from "./errors";
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

/**
 * Cancela uma compra parcelada (docs/23-INSTALLMENTS.md, "Cancelamento"):
 * soft-delete das Transactions das parcelas FUTURAS (`date > hoje`). Parcelas
 * já vencidas/pagas (`date <= hoje`) nunca são tocadas — mesmo histórico
 * intacto, mesmo padrão de `modules/loans/service.ts` `deleteLoan`
 * (`softDeleteUnpaidInstallments`).
 *
 * "Hoje" aqui é o mesmo instante usado por
 * `transactionService.listInstallmentPurchasesWithProgress` pra decidir
 * parcela "paga" (`transaction.date.getTime() <= refDate.getTime()`, default
 * `new Date()`) — reusar QUALQUER outra base (ex.: `nowInSaoPaulo()`, que
 * desloca os getters do Date pro horário de parede de SP) quebraria essa
 * consistência: `nowInSaoPaulo()` retorna um `Date` cujo epoch NÃO é o
 * instante real (serve só pra aritmética de calendário, ver
 * `installmentDueDate` acima), e compará-lo direto contra a `date`
 * (timestamptz real) da parcela daria um corte errado. Como cada parcela
 * nasce fixada à meia-noite de SP de um dia específico (`installmentDueDate`),
 * um corte por instante (`new Date()`) e um corte por dia calendário de SP
 * concordam sempre — não há necessidade de conversão de timezone aqui.
 *
 * Decisão de schema: `InstallmentPurchase` NÃO ganha um campo
 * `canceledAt`/`deletedAt` próprio — docs/23-INSTALLMENTS.md, "Estrutura da
 * Compra Parcelada" é explícito ("Sem ... status persistidos — tudo isso é
 * derivado") e a Regra 4 do doc proíbe um terceiro registro pro mesmo fato.
 * `totalAmount`/`installmentsCount` continuam intactos (Regra 1: "nunca
 * altera o totalAmount da compra depois de criado") — servem como registro
 * histórico do contrato original. O efeito de "cancelado" é 100% derivado:
 * sem nenhuma parcela futura viva, a compra naturalmente vira "Finalizada"
 * (`nextDueDate: null`) e `remainingAmount` some da leitura (ver ajuste em
 * `service.ts` `listInstallmentPurchasesWithProgress`/`listActiveInstallmentPurchases`).
 */
export async function cancelInstallmentPurchase(userId: string, installmentPurchaseId: string): Promise<void> {
  const purchase = await transactionRepository.findInstallmentPurchaseById(userId, installmentPurchaseId);
  if (!purchase) throw new InstallmentPurchaseNotFoundError(installmentPurchaseId);

  // Único write hoje — `$transaction` mantido por padronização com o
  // gêmeo `loanService.deleteLoan` (2 writes) e como ponto de extensão caso
  // uma futura escrita adicional precise entrar atomicamente aqui.
  await prisma.$transaction(async (tx) => {
    await transactionRepository.softDeleteFutureInstallments(userId, installmentPurchaseId, new Date(), tx);
  });
}
