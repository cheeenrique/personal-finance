import { CategoryType } from "@/generated/prisma/enums";
import { categoryService } from "@/modules/categories/service";
import { accountService } from "@/modules/accounts/service";
import type { Category, CategoryTreeNode } from "@/modules/categories/types";
import { normalizeWord } from "./normalize";
import { FallbackCategoryMissingError, NoActiveAccountError } from "./errors";
import type { TelegramTransactionType } from "./types";

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
 * Conta padrão para lançamento rápido via Telegram: a mais antiga (1ª
 * criada) entre as ativas do usuário. O módulo accounts não expõe "última
 * conta usada" hoje (só `transactionService.lastUsedCategory` existe pro
 * caso de categoria) — adicionar isso é sugestão de melhoria separada, fora
 * do escopo desta task (ver retorno).
 */
export async function resolveDefaultAccountId(userId: string): Promise<string> {
  const accounts = await accountService.listWithBalances(userId);
  const active = accounts.find((account) => account.isActive);
  if (!active) throw new NoActiveAccountError(userId);
  return active.id;
}
