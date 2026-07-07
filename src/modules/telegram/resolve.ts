import { CategoryType } from "@/generated/prisma/enums";
import { categoryService } from "@/modules/categories/service";
import { accountService } from "@/modules/accounts/service";
import { cardService } from "@/modules/cards/service";
import type { Category, CategoryTreeNode } from "@/modules/categories/types";
import { normalizeWord } from "./normalize";
import { FallbackCategoryMissingError, NoActiveAccountError } from "./errors";
import type { TelegramOrigin, TelegramOriginKind, TelegramTransactionType } from "./types";

/**
 * Fallback fixo por tipo (docs/24-CATEGORIES.md + docs/30-TELEGRAM.md, Regra
 * 2). "Outros" (EXPENSE) é o MESMO nome hardcoded usado pelo parser oficial
 * do produto (ver `modules/categories/service.ts`, `SYSTEM_FALLBACK_NAME`) —
 * nunca renomear/apagar essa categoria sem atualizar aqui também. "Outros
 * (Receita)" é o equivalente para INCOME (mesmo raciocínio: transação nunca
 * fica sem categoria).
 */
const FALLBACK_CATEGORY_NAME: Record<TelegramTransactionType, string> = {
  EXPENSE: "Outros",
  INCOME: "Outros (Receita)",
};

function flattenTree(nodes: CategoryTreeNode[]): Category[] {
  const flat: Category[] = [];
  for (const node of nodes) {
    flat.push(node);
    flat.push(...flattenTree(node.children));
  }
  return flat;
}

/** Nome da categoria em "partes" normalizadas (ex.: "Uber/99/Táxi" → ["uber", "99", "taxi"]) — permite bater uma palavra isolada com um nome composto. */
function categoryNameParts(name: string): string[] {
  return name
    .split(/[\s/]+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function matchByKeyword(candidates: string[], categories: Category[]): Category | null {
  for (const candidate of candidates) {
    const normalized = normalizeWord(candidate);
    if (!normalized) continue;

    const match = categories.find((category) => categoryNameParts(category.name).includes(normalized));
    if (match) return match;
  }

  return null;
}

/**
 * Categoria FILHA casada por palavra-chave é atribuída/exibida no nível PAI
 * (ex.: "mercado" bate com a filha "Mercado" de "Alimentação", mas a
 * transação usa "Alimentação") — mesma granularidade dos exemplos de
 * resposta do bot em docs/30-TELEGRAM.md ("Respostas do Bot", "Resumo").
 */
function toDisplayCategory(match: Category, byId: Map<string, Category>): Category {
  if (!match.parentId) return match;
  return byId.get(match.parentId) ?? match;
}

/**
 * Resolve a categoria de uma transação criada via Telegram (docs/30-TELEGRAM.md,
 * Regra 2 + "Estrutura de Interpretação"): 1) palavra-chave explícita ou a
 * própria descrição batendo com nome de categoria (própria ou filha, com
 * rollup pro pai) já existente do usuário; 2) fallback fixo
 * "Outros"/"Outros (Receita)" quando ambíguo ou nada reconhecido — nunca
 * fica sem categoria.
 */
export async function resolveCategoryId(
  userId: string,
  type: TelegramTransactionType,
  keywordCandidates: string[],
): Promise<{ id: string; name: string }> {
  const expectedType = type === "INCOME" ? CategoryType.INCOME : CategoryType.EXPENSE;
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree).filter((category) => category.type === expectedType);
  const byId = new Map(categories.map((category) => [category.id, category]));

  const keywordMatch = matchByKeyword(keywordCandidates, categories);
  if (keywordMatch) {
    const display = toDisplayCategory(keywordMatch, byId);
    return { id: display.id, name: display.name };
  }

  const fallback = categories.find((category) => category.name === FALLBACK_CATEGORY_NAME[type]);
  if (!fallback) throw new FallbackCategoryMissingError(userId, type);

  return { id: fallback.id, name: fallback.name };
}

/**
 * Resolve o `categoryName` sugerido pela IA (docs/30-TELEGRAM.md, "Parsing
 * por IA") contra as categorias REAIS do usuário: match EXATO por nome
 * (case/acento-insensível) — diferente de `matchByKeyword` acima (usado pelo
 * parser regex, que casa uma palavra isolada contra PARTES do nome, porque
 * ali as candidatas são palavras soltas da mensagem, não o nome completo
 * escolhido pela IA a partir da lista real). Sem match exato → cai no
 * `resolveCategoryId` existente (mesmo fallback "Outros"/"Outros (Receita)",
 * sem duplicar essa regra).
 */
export async function resolveCategoryByName(
  userId: string,
  type: TelegramTransactionType,
  categoryName: string | null,
  fallbackKeywordCandidates: string[],
): Promise<{ id: string; name: string }> {
  if (categoryName) {
    const expectedType = type === "INCOME" ? CategoryType.INCOME : CategoryType.EXPENSE;
    const tree = await categoryService.listTree(userId);
    const categories = flattenTree(tree).filter((category) => category.type === expectedType);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const normalizedTarget = normalizeWord(categoryName);

    const exactMatch = categories.find((category) => normalizeWord(category.name) === normalizedTarget);
    if (exactMatch) {
      const display = toDisplayCategory(exactMatch, byId);
      return { id: display.id, name: display.name };
    }
  }

  return resolveCategoryId(userId, type, fallbackKeywordCandidates);
}

/** Conta ATIVA mais antiga (1ª criada) do usuário — origem default quando nada mais resolve. */
async function findDefaultActiveAccount(userId: string) {
  const accounts = await accountService.listWithBalances(userId);
  const active = accounts.find((account) => account.isActive);
  if (!active) throw new NoActiveAccountError(userId);
  return active;
}

/**
 * Resolve a origem (conta OU cartão) de um lançamento via Telegram
 * (docs/30-TELEGRAM.md, "Parsing por IA"): se a IA identificou uma origem
 * (`originKind`/`originName`) e ela bate — case/acento-insensível — com uma
 * conta/cartão ATIVO real do usuário, usa essa origem; senão cai na conta
 * default (mesmo comportamento de hoje do lançamento rápido regex, ver
 * `findDefaultActiveAccount`). Chamado também pelo caminho regex com
 * `originKind`/`originName` nulos — sempre cai direto no default, sem mudar
 * o comportamento existente.
 */
export async function resolveOrigin(
  userId: string,
  originKind: TelegramOriginKind | null,
  originName: string | null,
): Promise<TelegramOrigin> {
  const normalizedTarget = originName ? normalizeWord(originName) : null;

  if (normalizedTarget && originKind === "card") {
    const cards = await cardService.listCards(userId);
    const match = cards.find((card) => card.isActive && normalizeWord(card.name) === normalizedTarget);
    if (match) return { kind: "card", id: match.id, label: `Cartão ${match.name}` };
  }

  if (normalizedTarget && originKind === "account") {
    const accounts = await accountService.listWithBalances(userId);
    const match = accounts.find((account) => account.isActive && normalizeWord(account.name) === normalizedTarget);
    if (match) return { kind: "account", id: match.id, label: `Conta ${match.name}` };
  }

  const fallback = await findDefaultActiveAccount(userId);
  return { kind: "account", id: fallback.id, label: `Conta ${fallback.name}` };
}

/** Nomes das categorias (ambos os tipos) do usuário — insumo do prompt da IA pra escolher a categoria mais próxima. */
export async function listCategoryNamesForAI(userId: string): Promise<string[]> {
  const tree = await categoryService.listTree(userId);
  return flattenTree(tree).map((category) => category.name);
}

/** Nomes de contas + cartões ATIVOS do usuário — insumo do prompt da IA pra escolher a origem do lançamento. */
export async function listOriginNamesForAI(
  userId: string,
): Promise<{ accountNames: string[]; cardNames: string[] }> {
  const [accounts, cards] = await Promise.all([accountService.listWithBalances(userId), cardService.listCards(userId)]);

  return {
    accountNames: accounts.filter((account) => account.isActive).map((account) => account.name),
    cardNames: cards.filter((card) => card.isActive).map((card) => card.name),
  };
}
