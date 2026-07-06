import { prisma } from "@/lib/db/client";

/**
 * Check de ownership cross-entidade — nunca criar uma Transaction de
 * CARD_PAYMENT referenciando Account de outro usuário mesmo sabendo o `id`
 * (docs/10-AUTH.md, "Regra Principal de Segurança"). Mesmo padrão de
 * `modules/transactions/ownership.ts` (arquivo próprio, separado do
 * repository de Card, por responsabilidade).
 */
async function accountExists(userId: string, accountId: string): Promise<boolean> {
  const found = await prisma.account.findFirst({
    where: { id: accountId, userId, deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

export const cardOwnership = { accountExists };
