import { CategoryType } from "@/generated/prisma/enums";
import type { Category } from "@/generated/prisma/client";
import { categoryRepository, type CreateCategoryData, type UpdateCategoryData } from "./repository";
import {
  CategoryNotFoundError,
  CategoryParentNotFoundError,
  CategoryParentTypeMismatchError,
  CategoryCycleError,
  CategoryHasChildrenError,
  CategorySystemFallbackError,
} from "./errors";
import type { CategoryTreeNode } from "./types";

/** Nome exato do fallback hardcoded do parser do Telegram (docs/24-CATEGORIES.md + docs/30-TELEGRAM.md "Regra 2"). */
const SYSTEM_FALLBACK_NAME = "Outros";

function isSystemFallbackCategory(category: Category): boolean {
  return (
    category.name === SYSTEM_FALLBACK_NAME && category.type === CategoryType.EXPENSE && category.parentId === null
  );
}

/** Monta a árvore (pais com filhas aninhadas) a partir da lista achatada — O(n), sem N+1 (docs/24-CATEGORIES.md, "Performance"). */
function buildTree(categories: Category[]): CategoryTreeNode[] {
  const nodesById = new Map<string, CategoryTreeNode>();
  for (const category of categories) {
    nodesById.set(category.id, { ...category, children: [] });
  }

  const roots: CategoryTreeNode[] = [];
  for (const category of categories) {
    const node = nodesById.get(category.id);
    if (!node) continue;

    if (category.parentId === null) {
      roots.push(node);
      continue;
    }

    const parent = nodesById.get(category.parentId);
    // Pai fora da lista (ex.: já deletado) — trata a filha órfã como raiz em vez de descartá-la.
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

async function listTree(userId: string): Promise<CategoryTreeNode[]> {
  const categories = await categoryRepository.listAll(userId);
  return buildTree(categories);
}

/**
 * Verifica se `categoryId` é ancestral de `newParentId` — se for, mover
 * `categoryId` para dentro de `newParentId` criaria um ciclo na árvore.
 * Caminha a cadeia de pais a partir de `newParentId` (bounded pelo `visited`
 * contra dado corrompido), sem carregar a árvore inteira.
 */
async function wouldCreateCycle(userId: string, categoryId: string, newParentId: string): Promise<boolean> {
  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === categoryId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const current = await categoryRepository.findById(userId, currentId);
    if (!current) return false;
    currentId = current.parentId;
  }

  return false;
}

async function createCategory(userId: string, input: CreateCategoryData): Promise<Category> {
  if (input.parentId) {
    const parent = await categoryRepository.findById(userId, input.parentId);
    if (!parent) throw new CategoryParentNotFoundError(input.parentId);
    if (parent.type !== input.type) {
      throw new CategoryParentTypeMismatchError(input.parentId, parent.type, input.type);
    }
  }

  return categoryRepository.create(userId, input);
}

async function updateCategory(userId: string, id: string, input: UpdateCategoryData): Promise<Category> {
  const existing = await categoryRepository.findById(userId, id);
  if (!existing) throw new CategoryNotFoundError(id);

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw new CategoryCycleError(id, input.parentId);

    const newParent = await categoryRepository.findById(userId, input.parentId);
    if (!newParent) throw new CategoryParentNotFoundError(input.parentId);
    if (newParent.type !== existing.type) {
      throw new CategoryParentTypeMismatchError(input.parentId, newParent.type, existing.type);
    }

    if (await wouldCreateCycle(userId, id, input.parentId)) {
      throw new CategoryCycleError(id, input.parentId);
    }
  }

  const updated = await categoryRepository.update(userId, id, input);
  if (!updated) throw new CategoryNotFoundError(id);
  return updated;
}

/**
 * Bloqueia exclusão de:
 * 1. categoria com filhas ativas (doc não define comportamento explícito —
 *    decisão do módulo: exigir mover/excluir as filhas primeiro em vez de
 *    cascatear silenciosamente);
 * 2. o fallback hardcoded "Outros" usado pelo parser do Telegram.
 */
async function deleteCategory(userId: string, id: string): Promise<void> {
  const existing = await categoryRepository.findById(userId, id);
  if (!existing) throw new CategoryNotFoundError(id);

  if (isSystemFallbackCategory(existing)) {
    throw new CategorySystemFallbackError(id);
  }

  const childrenCount = await categoryRepository.countChildren(userId, id);
  if (childrenCount > 0) {
    throw new CategoryHasChildrenError(id);
  }

  await categoryRepository.softDelete(userId, id);
}

export const categoryService = {
  listTree,
  createCategory,
  updateCategory,
  deleteCategory,
};
