import { prisma } from "@/lib/db/client";
import { Prisma, type Asset, type MarketIndexQuote } from "@/generated/prisma/client";
import {
  AssetType,
  MarketIndex,
  MarketIndexQuoteSource,
  TransactionType,
  YieldBenchmark,
} from "@/generated/prisma/enums";
import type { InvestmentContributionRow, InvestmentListItem } from "./types";

type Db = Prisma.TransactionClient | typeof prisma;

async function listInvestments(userId: string): Promise<InvestmentListItem[]> {
  const rows = await prisma.asset.findMany({
    where: { userId, type: AssetType.INVESTMENT, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      currentValue: true,
      purchaseValue: true,
      purchaseDate: true,
      yieldPercentOfBenchmark: true,
      notes: true,
    },
  });

  return rows;
}

async function findInvestment(userId: string, id: string): Promise<Asset | null> {
  return prisma.asset.findFirst({
    where: { id, userId, type: AssetType.INVESTMENT, deletedAt: null },
  });
}

async function listContributions(userId: string, assetId: string): Promise<InvestmentContributionRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      assetId,
      type: TransactionType.EXPENSE,
      deletedAt: null,
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      accountId: true,
      yieldPercentOfBenchmark: true,
      account: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    amount: row.amount,
    date: row.date,
    accountId: row.accountId,
    accountName: row.account?.name ?? null,
    yieldPercentOfBenchmark: row.yieldPercentOfBenchmark,
  }));
}

async function createInvestmentAsset(
  userId: string,
  data: {
    name: string;
    purchaseDate: Date;
    yieldPercentOfBenchmark: string;
    notes?: string | null;
  },
  db: Db = prisma,
): Promise<Asset> {
  return db.asset.create({
    data: {
      userId,
      name: data.name,
      type: AssetType.INVESTMENT,
      purchaseValue: "0",
      currentValue: "0",
      purchaseDate: data.purchaseDate,
      notes: data.notes ?? null,
      yieldBenchmark: YieldBenchmark.CDI,
      yieldPercentOfBenchmark: data.yieldPercentOfBenchmark,
    },
  });
}

async function updateInvestmentAsset(
  id: string,
  data: {
    name?: string;
    yieldPercentOfBenchmark?: string;
    notes?: string | null;
  },
  db: Db = prisma,
): Promise<Asset> {
  return db.asset.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.yieldPercentOfBenchmark !== undefined && {
        yieldPercentOfBenchmark: data.yieldPercentOfBenchmark,
      }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}

/**
 * Sobe `currentValue` pelo aporte e grava snapshot — atômico com a Transaction
 * de aporte quando chamado dentro do mesmo `$transaction`.
 */
async function applyContributionToAsset(
  assetId: string,
  amount: string,
  snapshotDate: Date,
  db: Db = prisma,
): Promise<Asset> {
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  const nextValue = new Prisma.Decimal(asset.currentValue).plus(amount);
  const purchaseValue =
    new Prisma.Decimal(asset.purchaseValue).isZero()
      ? nextValue
      : new Prisma.Decimal(asset.purchaseValue).plus(amount);

  // Escrita sequencial — seguro em tx interativa Prisma (sem Promise.all concorrente).
  const updated = await db.asset.update({
    where: { id: assetId },
    data: {
      currentValue: nextValue,
      purchaseValue,
    },
  });
  await db.assetSnapshot.create({
    data: { assetId, value: nextValue, date: snapshotDate },
  });

  return updated;
}

async function createContributionTransaction(
  userId: string,
  data: {
    description: string;
    amount: string;
    categoryId: string;
    accountId: string;
    assetId: string;
    date: Date;
    notes: string | null;
    yieldPercentOfBenchmark: string | null;
  },
  db: Db = prisma,
) {
  return db.transaction.create({
    data: {
      userId,
      description: data.description,
      type: TransactionType.EXPENSE,
      amount: data.amount,
      categoryId: data.categoryId,
      accountId: data.accountId,
      cardId: null,
      date: data.date,
      notes: data.notes,
      isPaid: true,
      assetId: data.assetId,
      yieldPercentOfBenchmark: data.yieldPercentOfBenchmark,
    },
  });
}

async function softDeleteInvestment(userId: string, id: string): Promise<Asset | null> {
  const existing = await findInvestment(userId, id);
  if (!existing) return null;
  return prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
}

async function findCdiQuote(date: Date): Promise<MarketIndexQuote | null> {
  return prisma.marketIndexQuote.findUnique({
    where: { index_date: { index: MarketIndex.CDI, date } },
  });
}

async function upsertCdiQuote(data: {
  date: Date;
  annualRatePercent: string;
  source: MarketIndexQuoteSource;
}): Promise<MarketIndexQuote> {
  return prisma.marketIndexQuote.upsert({
    where: { index_date: { index: MarketIndex.CDI, date: data.date } },
    create: {
      index: MarketIndex.CDI,
      date: data.date,
      annualRatePercent: data.annualRatePercent,
      source: data.source,
      fetchedAt: new Date(),
    },
    update: {
      annualRatePercent: data.annualRatePercent,
      source: data.source,
      fetchedAt: new Date(),
    },
  });
}

/** Soma de `currentValue` de todos os investimentos ativos do usuário — valor investido total (box do Dashboard). */
async function sumInvestedTotal(userId: string): Promise<Prisma.Decimal> {
  const result = await prisma.asset.aggregate({
    where: { userId, type: AssetType.INVESTMENT, deletedAt: null },
    _sum: { currentValue: true },
  });

  return result._sum.currentValue ?? new Prisma.Decimal(0);
}

export const investmentRepository = {
  listInvestments,
  findInvestment,
  listContributions,
  createInvestmentAsset,
  updateInvestmentAsset,
  applyContributionToAsset,
  createContributionTransaction,
  softDeleteInvestment,
  findCdiQuote,
  upsertCdiQuote,
  sumInvestedTotal,
};
