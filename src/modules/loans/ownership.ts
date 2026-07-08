import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient;

/**
 * Checks de ownership cross-entidade — nunca criar um Loan referenciando
 * Account/Category de outro usuário mesmo sabendo o `id` (docs/10-AUTH.md,
 * "Regra Principal de Segurança"). Mesmo padrão de
 * `modules/transactions/ownership.ts` / `modules/cards/ownership.ts` —
 * arquivo próprio, separado do repository, por responsabilidade (rule
 * 05-naming-size.md).
 *
 * Aceita `db` opcional pra rodar dentro da `$transaction` de `installments.ts`.
 */

async function accountExists(userId: string, accountId: string, db: Db = prisma): Promise<boolean> {
  const found = await db.account.findFirst({
    where: { id: accountId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

async function categoryExists(userId: string, categoryId: string, db: Db = prisma): Promise<boolean> {
  const found = await db.category.findFirst({
    where: { id: categoryId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

/** Ownership do `Asset` linkado a um financiamento (`Loan.assetId`, opcional) — mesma regra das outras entidades cross deste arquivo. */
async function assetExists(userId: string, assetId: string, db: Db = prisma): Promise<boolean> {
  const found = await db.asset.findFirst({
    where: { id: assetId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

export const loanOwnership = { accountExists, categoryExists, assetExists };
