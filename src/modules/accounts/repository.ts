import { prisma } from "@/lib/db/client";
import { Prisma, type Account } from "@/generated/prisma/client";
import { TransactionType, type AccountType } from "@/generated/prisma/enums";

export type CreateAccountData = {
  name: string;
  type: AccountType;
  initialBalance: string;
  color?: string | null;
  icon?: string | null;
};

export type UpdateAccountData = Partial<CreateAccountData> & { isActive?: boolean };

/** Soma agregada de Transactions por conta+tipo — insumo para o cálculo de saldo (ver service.ts). */
export type AccountTypeSum = {
  accountId: string;
  type: string;
  sum: Prisma.Decimal;
};

/**
 * Acesso a dados do módulo accounts. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

async function findById(userId: string, id: string): Promise<Account | null> {
  return prisma.account.findFirst({ where: { id, userId, deletedAt: null } });
}

async function list(userId: string): Promise<Account[]> {
  return prisma.account.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

async function create(userId: string, data: CreateAccountData): Promise<Account> {
  return prisma.account.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      initialBalance: data.initialBalance,
      color: data.color ?? null,
      icon: data.icon ?? null,
    },
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * conta de outro usuário mesmo sabendo o `id` (cuid não é enumerável, mas o
 * isolamento por userId é a regra de ouro do projeto, não opcional).
 */
async function update(userId: string, id: string, data: UpdateAccountData): Promise<Account | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.account.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.initialBalance !== undefined && { initialBalance: data.initialBalance }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

/** Soft delete — nunca remove fisicamente (docs/21-ACCOUNTS.md, "Exclusão: preferência soft delete"). */
async function softDelete(userId: string, id: string): Promise<Account | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.account.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/**
 * Soma de Transactions (INCOME/EXPENSE/CARD_PAYMENT) por conta, agrupada por
 * tipo — 1 query para N contas (evita N+1 em `listWithBalances`). Filtra
 * `isPaid: true` (docs/21-ACCOUNTS.md: saldo considera só as pagas) e
 * `deletedAt: null` (soft delete de transação nunca conta no saldo).
 */
async function sumAmountsByType(userId: string, accountIds: string[]): Promise<AccountTypeSum[]> {
  if (accountIds.length === 0) return [];

  const rows = await prisma.transaction.groupBy({
    by: ["accountId", "type"],
    where: {
      userId,
      accountId: { in: accountIds },
      deletedAt: null,
      isPaid: true,
    },
    _sum: { amount: true },
  });

  return rows
    .filter((row): row is typeof row & { accountId: string } => row.accountId !== null)
    .map((row) => ({
      accountId: row.accountId,
      type: row.type,
      sum: row._sum.amount ?? new Prisma.Decimal(0),
    }));
}

/** Uma despesa prevista (EXPENSE, isPaid=false) — insumo do waterfall de "Saldo insuficiente" (ver service.ts `getInsufficientBalanceReport`). */
export type UnpaidExpenseRow = {
  id: string;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  accountId: string;
};

/**
 * Despesas previstas (EXPENSE, `isPaid=false`) das contas informadas, até
 * `before` (exclusive) — vencidas + do mês corrente, nunca meses futuros
 * (`before` é o início do PRÓXIMO mês, calculado no service). 1 query para N
 * contas, sem N+1 (mesmo padrão de `sumAmountsByType`/`cardRepository.
 * listExpensesForCards`). Ordenada por `date` asc: o waterfall cobre a
 * previsão mais antiga primeiro.
 */
async function listUnpaidExpensesByAccount(
  userId: string,
  accountIds: string[],
  before: Date,
): Promise<UnpaidExpenseRow[]> {
  if (accountIds.length === 0) return [];

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      accountId: { in: accountIds },
      type: TransactionType.EXPENSE,
      isPaid: false,
      deletedAt: null,
      date: { lt: before },
    },
    select: { id: true, description: true, amount: true, date: true, accountId: true },
    orderBy: { date: "asc" },
  });

  return rows.filter((row): row is typeof row & { accountId: string } => row.accountId !== null);
}

export const accountRepository = {
  findById,
  list,
  create,
  update,
  softDelete,
  sumAmountsByType,
  listUnpaidExpensesByAccount,
};
