import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient;

/**
 * Check de ownership cross-entidade — nunca criar uma Transaction de
 * CARD_PAYMENT referenciando Account de outro usuário mesmo sabendo o `id`
 * (docs/10-AUTH.md, "Regra Principal de Segurança"). Mesmo padrão de
 * `modules/transactions/ownership.ts` (arquivo próprio, separado do
 * repository de Card, por responsabilidade).
 *
 * Aceita `db` opcional pra rodar dentro da `$transaction` de `pay-invoice.ts`.
 */
async function accountExists(userId: string, accountId: string, db: Db = prisma): Promise<boolean> {
  const found = await db.account.findFirst({
    where: { id: accountId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

export const cardOwnership = { accountExists };
