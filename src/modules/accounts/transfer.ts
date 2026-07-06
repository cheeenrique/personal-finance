import crypto from "node:crypto";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { accountRepository } from "./repository";
import { TransferAccountNotFoundError, TransferSameAccountError } from "./errors";
import type { TransferInput } from "./schemas";
import type { TransferResult } from "./types";

/**
 * Decisão de modelagem de transferência (docs/21-ACCOUNTS.md "Transferência
 * entre contas" + docs/20-TRANSACTIONS.md "Transferência" — ambos já mandam
 * este modelo, nenhuma ambiguidade a resolver e nenhuma migration necessária):
 *
 * Uma TRANSFER gera 2 Transactions reais com o MESMO `transferId`:
 *   - perna origem:  type=EXPENSE, accountId=fromAccountId
 *   - perna destino: type=INCOME,  accountId=toAccountId
 * `categoryId=null` nas duas. Não existe `type=TRANSFER` persistido nem
 * coluna de direção — o saldo usa o sinal natural do `type` de cada perna
 * (EXPENSE debita, INCOME credita, ver service.ts `signedAmount`), e a
 * exclusão de KPIs de receita/despesa se faz filtrando `transferId IS NOT
 * NULL` nas queries de relatório (fora do escopo deste módulo).
 */
export async function createTransfer(userId: string, input: TransferInput): Promise<TransferResult> {
  if (input.fromAccountId === input.toAccountId) {
    throw new TransferSameAccountError(input.fromAccountId);
  }

  const [fromAccount, toAccount] = await Promise.all([
    accountRepository.findById(userId, input.fromAccountId),
    accountRepository.findById(userId, input.toAccountId),
  ]);

  if (!fromAccount) throw new TransferAccountNotFoundError(input.fromAccountId, "origin");
  if (!toAccount) throw new TransferAccountNotFoundError(input.toAccountId, "destination");

  const transferId = crypto.randomUUID();

  const [expenseLeg, incomeLeg] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId,
        description: input.description,
        type: TransactionType.EXPENSE,
        amount: input.amount,
        accountId: input.fromAccountId,
        categoryId: null,
        date: input.date,
        transferId,
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        description: input.description,
        type: TransactionType.INCOME,
        amount: input.amount,
        accountId: input.toAccountId,
        categoryId: null,
        date: input.date,
        transferId,
      },
    }),
  ]);

  return {
    transferId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: new Prisma.Decimal(input.amount),
    date: input.date,
    fromTransactionId: expenseLeg.id,
    toTransactionId: incomeLeg.id,
  };
}
