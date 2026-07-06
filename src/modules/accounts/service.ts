import { Prisma, type Account } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { accountRepository, type CreateAccountData, type UpdateAccountData } from "./repository";
import { AccountNotFoundError } from "./errors";
import type { AccountWithBalance } from "./types";

/**
 * Sinal de cada tipo de Transaction no saldo da conta. INCOME soma, EXPENSE e
 * CARD_PAYMENT subtraem (docs/03-DATABASE.md: CARD_PAYMENT "reduz o saldo da
 * conta"). `TRANSFER` "puro" nunca aparece aqui — as pernas de transferência
 * já chegam como EXPENSE/INCOME (ver transfer.ts para a decisão de modelagem).
 */
function signedAmount(type: string, amount: Prisma.Decimal): Prisma.Decimal {
  switch (type) {
    case TransactionType.INCOME:
      return amount;
    case TransactionType.EXPENSE:
    case TransactionType.CARD_PAYMENT:
      return amount.negated();
    default:
      return new Prisma.Decimal(0);
  }
}

function computeBalance(
  initialBalance: Prisma.Decimal,
  sums: Array<{ type: string; sum: Prisma.Decimal }>,
): Prisma.Decimal {
  return sums.reduce((total, { type, sum }) => total.plus(signedAmount(type, sum)), initialBalance);
}

/** Saldo derivado sob demanda — `initialBalance + Σ Transactions` (docs/21-ACCOUNTS.md). */
async function getBalance(userId: string, accountId: string): Promise<Prisma.Decimal> {
  const account = await accountRepository.findById(userId, accountId);
  if (!account) throw new AccountNotFoundError(accountId);

  const sums = await accountRepository.sumAmountsByType(userId, [accountId]);
  return computeBalance(account.initialBalance, sums);
}

/** Lista contas + saldo de cada, em 1-2 queries (sem N+1). */
async function listWithBalances(userId: string): Promise<AccountWithBalance[]> {
  const accounts = await accountRepository.list(userId);
  if (accounts.length === 0) return [];

  const sums = await accountRepository.sumAmountsByType(
    userId,
    accounts.map((account) => account.id),
  );

  const sumsByAccount = new Map<string, Array<{ type: string; sum: Prisma.Decimal }>>();
  for (const row of sums) {
    const bucket = sumsByAccount.get(row.accountId) ?? [];
    bucket.push({ type: row.type, sum: row.sum });
    sumsByAccount.set(row.accountId, bucket);
  }

  return accounts.map((account) => ({
    ...account,
    balance: computeBalance(account.initialBalance, sumsByAccount.get(account.id) ?? []),
  }));
}

/** Soma dos saldos de TODAS as contas ativas, incluindo OTHER (docs/21-ACCOUNTS.md). */
async function totalBalance(userId: string): Promise<Prisma.Decimal> {
  const accounts = await listWithBalances(userId);
  return accounts.reduce((total, account) => total.plus(account.balance), new Prisma.Decimal(0));
}

async function createAccount(userId: string, input: CreateAccountData): Promise<Account> {
  return accountRepository.create(userId, input);
}

async function updateAccount(userId: string, id: string, input: UpdateAccountData): Promise<Account> {
  const updated = await accountRepository.update(userId, id, input);
  if (!updated) throw new AccountNotFoundError(id);
  return updated;
}

/**
 * Soft delete (docs/21-ACCOUNTS.md: "preferência soft delete"). Não bloqueia
 * por transações existentes — elas continuam referenciando a conta
 * normalmente (soft delete não quebra FK, diferente de exclusão física).
 */
async function deleteAccount(userId: string, id: string): Promise<void> {
  const deleted = await accountRepository.softDelete(userId, id);
  if (!deleted) throw new AccountNotFoundError(id);
}

export const accountService = {
  getBalance,
  listWithBalances,
  totalBalance,
  createAccount,
  updateAccount,
  deleteAccount,
};
