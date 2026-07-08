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
 * positivo"): `amount` não pode exceder o devedor atual do cartão. Dois
 * pagamentos concorrentes (duplo clique) abrem TOCTOU: ambos leem o mesmo
 * devedor, ambos passam no guard, os dois INSERTs entram e o cartão fica
 * credor. O `$transaction` interativo sozinho NÃO fecha essa janela — o
 * Postgres roda em READ COMMITTED por padrão, então as duas transações
 * enxergam o devedor pré-pagamento. A atomicidade real vem do lock pessimista
 * de linha (`SELECT ... FOR UPDATE` no cartão), PRIMEIRO statement da
 * transação: pagamentos do mesmo cartão serializam nesse lock; o perdedor
 * bloqueia até o vencedor commitar e, ao prosseguir, relê o devedor JÁ com o
 * pagamento commitado (READ COMMITTED tira snapshot novo por statement) e
 * revalida o guard — o excedente falha com PAYMENT_EXCEEDS_BALANCE em vez de
 * deixar o cartão credor. Por isso `outstandingBalance` lê no client `tx`
 * (sob o lock), não no `prisma` padrão.
 *
 * Lock de linha em vez de `isolationLevel: Serializable`: desfecho
 * determinístico (bloqueia → relê → erro de domínio) sem loop de retry pra
 * 40001/P2034, e sem pressão extra no pool pequeno (`lib/db/client.ts`,
 * `max: 5`). O lock atravessa o transaction pooler do Supabase sem problema —
 * a `$transaction` interativa segura UMA sessão do BEGIN ao COMMIT. Compra
 * nova concorrente não disputa o lock, mas só AUMENTA o devedor — não viola a
 * Regra 1.
 */
export async function payInvoice(userId: string, input: PayInvoiceInput): Promise<PayInvoiceResult> {
  return prisma.$transaction(async (tx) => {
    // Lock pessimista na linha do cartão, PRIMEIRO statement da transação —
    // pagamentos concorrentes do mesmo cartão serializam aqui (ver JSDoc).
    // Escopado por userId + deletedAt como toda query do módulo
    // (repository.ts); linha ausente = inexistente ou de outro usuário.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Card"
      WHERE "id" = ${input.cardId} AND "userId" = ${userId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length === 0) throw new CardNotFoundError(input.cardId);

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
