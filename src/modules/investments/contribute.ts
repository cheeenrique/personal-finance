import { Prisma, type Asset } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";
import { accountService } from "@/modules/accounts/service";
import { assertAccountOwnership, assertCategoryOwnership } from "@/modules/transactions/service";
import { investmentRepository } from "./repository";
import { InsufficientAccountBalanceError, InvestmentNotFoundError } from "./errors";
import type { ContributeToInvestmentInput, CreateInvestmentInput } from "./schemas";

type ContributeParams = ContributeToInvestmentInput & {
  description?: string;
};

async function assertBalance(userId: string, accountId: string, amount: string): Promise<void> {
  const balance = await accountService.getBalance(userId, accountId);
  if (new Prisma.Decimal(amount).greaterThan(balance)) {
    throw new InsufficientAccountBalanceError({
      accountId,
      amount,
      balance: balance.toString(),
    });
  }
}

/**
 * Aporte em investimento (docs/28-INVESTMENTS.md):
 * 1) valida ownership + saldo da conta (teto duro)
 * 2) cria Transaction EXPENSE paga com assetId
 * 3) sobe currentValue + AssetSnapshot
 */
export async function contributeToInvestment(
  userId: string,
  investmentId: string,
  input: ContributeParams,
): Promise<{ asset: Asset; transactionId: string }> {
  const investment = await investmentRepository.findInvestment(userId, investmentId);
  if (!investment) throw new InvestmentNotFoundError(investmentId);

  await assertAccountOwnership(userId, input.accountId);
  await assertCategoryOwnership(userId, input.categoryId, TransactionType.EXPENSE);
  await assertBalance(userId, input.accountId, input.amount);

  const override = input.yieldPercentOfBenchmark !== undefined ? input.yieldPercentOfBenchmark : null;
  const description = input.description ?? `Aporte — ${investment.name}`;

  return prisma.$transaction(async (tx) => {
    const transaction = await investmentRepository.createContributionTransaction(
      userId,
      {
        description,
        amount: input.amount,
        categoryId: input.categoryId,
        accountId: input.accountId,
        assetId: investment.id,
        date: input.date,
        notes: input.notes ?? null,
        yieldPercentOfBenchmark: override,
      },
      tx,
    );

    const asset = await investmentRepository.applyContributionToAsset(
      investment.id,
      input.amount,
      new Date(),
      tx,
    );

    return { asset, transactionId: transaction.id };
  });
}

/**
 * Cria Asset + aporte inicial no mesmo `$transaction` (evita asset órfão
 * se o aporte falhar por saldo).
 */
export async function createInvestmentWithOptionalContribution(
  userId: string,
  input: CreateInvestmentInput,
): Promise<Asset> {
  const purchaseDate = input.initialContribution?.date ?? new Date();

  if (input.initialContribution) {
    await assertAccountOwnership(userId, input.initialContribution.accountId);
    await assertCategoryOwnership(userId, input.initialContribution.categoryId, TransactionType.EXPENSE);
    await assertBalance(userId, input.initialContribution.accountId, input.initialContribution.amount);
  }

  return prisma.$transaction(async (tx) => {
    const asset = await investmentRepository.createInvestmentAsset(
      userId,
      {
        name: input.name,
        purchaseDate,
        yieldPercentOfBenchmark: input.yieldPercentOfBenchmark,
        notes: input.notes ?? null,
      },
      tx,
    );

    if (!input.initialContribution) return asset;

    const contrib = input.initialContribution;
    const override =
      contrib.yieldPercentOfBenchmark !== undefined ? contrib.yieldPercentOfBenchmark : null;

    await investmentRepository.createContributionTransaction(
      userId,
      {
        description: `Aporte — ${asset.name}`,
        amount: contrib.amount,
        categoryId: contrib.categoryId,
        accountId: contrib.accountId,
        assetId: asset.id,
        date: contrib.date,
        notes: null,
        yieldPercentOfBenchmark: override,
      },
      tx,
    );

    return investmentRepository.applyContributionToAsset(asset.id, contrib.amount, new Date(), tx);
  });
}
