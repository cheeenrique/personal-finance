import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { cardRepository } from "./repository";
import { cardOwnership } from "./ownership";
import { cardService } from "./service";
import { CardNotFoundError, InvalidInvoiceError, PaymentExceedsBalanceError } from "./errors";
import type { PayInvoiceInput } from "./schemas";
import type { PayInvoiceResult } from "./types";

/**
 * Pagamento de fatura (docs/22-CREDIT_CARDS.md, "Status de Pagamento no
 * Cartão" > "Pagamento da fatura"): UMA Transaction com `type=CARD_PAYMENT`,
 * `accountId` (conta pagadora) + `cardId` (fatura abatida) preenchidos,
 * `categoryId=null`, `isPaid=true`.
 *
 * Isso resolve a ambiguidade deixada pelo módulo de transações genérico: o
 * schema de lá exige XOR conta/cartão (`modules/transactions/schemas.ts`,
 * `assertSourceAndCategoryInvariant`), mas CARD_PAYMENT é a exceção
 * documentada que precisa dos DOIS — tratado aqui, não lá, para não abrir
 * uma exceção silenciosa na invariante geral de Transaction.
 *
 * Efeito: reduz o saldo da conta e abate o devedor do cartão — ambos
 * DERIVADOS (`accountService.getBalance`, `cardService.outstandingBalance`);
 * esta função só cria a linha.
 *
 * Guard (docs/22-CREDIT_CARDS.md, Regra 1: "Cartão nunca pode ter saldo
 * positivo"): `amount` não pode exceder o devedor atual do cartão. Ler o
 * devedor e gravar o pagamento fora de uma mesma transação abriria uma janela
 * de TOCTOU (duas requisições concorrentes de pagamento, ou uma compra nova
 * entrando entre a leitura e o INSERT, poderiam deixar o cartão credor) — por
 * isso todo o fluxo roda dentro de um `$transaction` interativo (mesmo padrão
 * de `modules/transactions/installments.ts`), com `outstandingBalance` lendo
 * no client `tx`, não no `prisma` padrão.
 */
export async function payInvoice(userId: string, input: PayInvoiceInput): Promise<PayInvoiceResult> {
  return prisma.$transaction(async (tx) => {
    const [card, accountExists] = await Promise.all([
      cardRepository.findById(userId, input.cardId, tx),
      cardOwnership.accountExists(userId, input.accountId, tx),
    ]);

    if (!card) throw new CardNotFoundError(input.cardId);
    if (!accountExists) {
      throw new InvalidInvoiceError("Conta não encontrada", { accountId: input.accountId });
    }

    const outstanding = await cardService.outstandingBalance(userId, input.cardId, tx);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.greaterThan(outstanding)) {
      throw new PaymentExceedsBalanceError(input.amount, outstanding.toString(), input.cardId);
    }

    const transaction = await tx.transaction.create({
      data: {
        userId,
        description: input.description ?? `Pagamento fatura ${card.name}`,
        type: TransactionType.CARD_PAYMENT,
        amount: input.amount,
        accountId: input.accountId,
        cardId: input.cardId,
        categoryId: null,
        date: input.date,
        isPaid: true,
      },
    });

    return {
      transactionId: transaction.id,
      cardId: input.cardId,
      accountId: input.accountId,
      amount: transaction.amount,
      date: transaction.date,
    };
  });
}
