import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";

export type TransactionSearchRow = {
  id: string;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
};

export type NamedSearchRow = { id: string; name: string };
export type CardSearchRow = { id: string; name: string; brand: string };

/**
 * Acesso a dados do módulo search. Cada finder busca só a entidade que
 * o nome diz — SEMPRE escopado por `userId` + `deletedAt: null` (docs/
 * 03-DATABASE.md, "Princípio Principal"), `contains`/`insensitive` (mesmo
 * idioma de `transactions/repository.ts` `findDescriptionSuggestions`).
 */

async function searchTransactions(
  userId: string,
  query: string,
  limit: number,
): Promise<TransactionSearchRow[]> {
  return prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      description: { contains: query, mode: "insensitive" },
    },
    select: { id: true, description: true, amount: true, date: true },
    orderBy: { date: "desc" },
    take: limit,
  });
}

async function searchAccounts(
  userId: string,
  query: string,
  limit: number,
): Promise<NamedSearchRow[]> {
  return prisma.account.findMany({
    where: { userId, deletedAt: null, name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: limit,
  });
}

async function searchCards(
  userId: string,
  query: string,
  limit: number,
): Promise<CardSearchRow[]> {
  return prisma.card.findMany({
    where: { userId, deletedAt: null, name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true, brand: true },
    orderBy: { name: "asc" },
    take: limit,
  });
}

async function searchCategories(
  userId: string,
  query: string,
  limit: number,
): Promise<NamedSearchRow[]> {
  return prisma.category.findMany({
    where: { userId, deletedAt: null, name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: limit,
  });
}

async function searchTags(
  userId: string,
  query: string,
  limit: number,
): Promise<NamedSearchRow[]> {
  return prisma.tag.findMany({
    where: { userId, deletedAt: null, name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: limit,
  });
}

export const searchRepository = {
  searchTransactions,
  searchAccounts,
  searchCards,
  searchCategories,
  searchTags,
};
