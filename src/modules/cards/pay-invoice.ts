import { prisma } from "@/lib/db/client";
import { TransactionType } from "@/generated/prisma/enums";
import { cardRepository } from "./repository";
import { cardOwnership } from "./ownership";
import { CardNotFoundError, InvalidInvoiceError } from "./errors";
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
 * esta função só cria a linha. `prisma.transaction.create` é um único INSERT
 * — atômico por natureza, sem necessidade de `$transaction` (que só se
 * justifica para múltiplas escritas coordenadas, ver
 * `modules/accounts/transfer.ts` e `modules/transactions/installments.ts`
 * para exemplos de quando isso é necessário).
 */
export async function payInvoice(userId: string, input: PayInvoiceInput): Promise<PayInvoiceResult> {
  const [card, accountExists] = await Promise.all([
    cardRepository.findById(userId, input.cardId),
    cardOwnership.accountExists(userId, input.accountId),
  ]);

  if (!card) throw new CardNotFoundError(input.cardId);
  if (!accountExists) {
    throw new InvalidInvoiceError("Conta não encontrada", { accountId: input.accountId });
  }

  const transaction = await prisma.transaction.create({
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
}
