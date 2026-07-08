import { formatBRL } from "@/lib/money/format";
import { formatDateShortSaoPaulo } from "@/lib/date/format";
import { searchRepository } from "./repository";
import type { SearchResultItem } from "./types";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
/** Por tipo de entidade — teto maior que `TOTAL_LIMIT` pra sobrar candidato pro round-robin abaixo. */
const PER_TYPE_LIMIT = 5;
/** Total exibido no Command Palette (docs/50-AUDITORIA-BACKLOG.md, F1: "top ~8"). */
const TOTAL_LIMIT = 8;

/** Intercala os grupos (1 de cada tipo por rodada) pra nenhuma entidade com muitos matches "engolir" as outras antes do corte de `TOTAL_LIMIT`. */
function roundRobinMerge(groups: SearchResultItem[][]): SearchResultItem[] {
  const merged: SearchResultItem[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (group[index]) merged.push(group[index]);
    }
  }

  return merged;
}

/**
 * Busca de entidades pro Command Palette (docs/06-SCREENS.md, "Command
 * Palette": "Busca... em: transações (por descrição), contas, cartões,
 * categorias, tags"). Query curta demais não dispara busca nenhuma (mesmo
 * corte de `transactionService.suggestDescriptions`, `MIN_QUERY_LENGTH = 2`).
 */
async function searchEntities(
  userId: string,
  query: string,
): Promise<SearchResultItem[]> {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const [transactions, accounts, cards, categories, tags] = await Promise.all([
    searchRepository.searchTransactions(userId, trimmed, PER_TYPE_LIMIT),
    searchRepository.searchAccounts(userId, trimmed, PER_TYPE_LIMIT),
    searchRepository.searchCards(userId, trimmed, PER_TYPE_LIMIT),
    searchRepository.searchCategories(userId, trimmed, PER_TYPE_LIMIT),
    searchRepository.searchTags(userId, trimmed, PER_TYPE_LIMIT),
  ]);

  const transactionItems: SearchResultItem[] = transactions.map((row) => ({
    kind: "transaction",
    id: row.id,
    title: row.description,
    subtitle: `${formatBRL(row.amount.toString())} · ${formatDateShortSaoPaulo(row.date)}`,
    href: `/transactions?q=${encodeURIComponent(row.description)}`,
  }));

  const accountItems: SearchResultItem[] = accounts.map((row) => ({
    kind: "account",
    id: row.id,
    title: row.name,
    href: `/accounts/${row.id}`,
  }));

  const cardItems: SearchResultItem[] = cards.map((row) => ({
    kind: "card",
    id: row.id,
    title: row.name,
    subtitle: row.brand,
    href: `/cards/${row.id}`,
  }));

  const categoryItems: SearchResultItem[] = categories.map((row) => ({
    kind: "category",
    id: row.id,
    title: row.name,
    href: "/categories",
  }));

  const tagItems: SearchResultItem[] = tags.map((row) => ({
    kind: "tag",
    id: row.id,
    title: row.name,
    href: "/tags",
  }));

  const merged = roundRobinMerge([
    transactionItems,
    accountItems,
    cardItems,
    categoryItems,
    tagItems,
  ]);
  return merged.slice(0, TOTAL_LIMIT);
}

export const searchService = { searchEntities };
