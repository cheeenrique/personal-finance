import { Prisma, type Budget } from "@/generated/prisma/client";
import { CategoryType } from "@/generated/prisma/enums";
import { parseInSaoPaulo } from "@/lib/date/timezone";
import {
  budgetRepository,
  type CreateBudgetData,
  type UpdateBudgetData,
  type CategoryHierarchyNode,
  type DateRange,
} from "./repository";
import {
  BudgetNotFoundError,
  BudgetAlreadyExistsError,
  BudgetCategoryNotFoundError,
  BudgetCategoryTypeMismatchError,
} from "./errors";
import type { BudgetStatus, BudgetWithProgress, Money } from "./types";

/** Códigos de erro do Postgres via Prisma — ver https://www.prisma.io/docs/orm/reference/error-reference. */
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
}

/**
 * Categoria deve pertencer ao usuário e ser EXPENSE — orçamento só faz
 * sentido pra despesa, já que `spentAmount` soma só Transactions EXPENSE
 * (docs/26-BUDGETS.md, "Cálculo"). Retorna a categoria pra reuso (evita 2ª
 * query em `createBudget`/`updateBudget`).
 */
async function assertBudgetableCategory(userId: string, categoryId: string): Promise<void> {
  const category = await budgetRepository.findCategoryForUser(userId, categoryId);
  if (!category) throw new BudgetCategoryNotFoundError(categoryId);
  if (category.type !== CategoryType.EXPENSE) throw new BudgetCategoryTypeMismatchError(categoryId);
}

/**
 * Monta `parentId -> [childId, ...]` a partir da lista achatada de categorias
 * do usuário — insumo de `resolveCategoryIdsWithDescendants`. O(n), 1 query
 * (docs/24-CATEGORIES.md, "Performance": "evitar joins pesados").
 */
function buildChildrenMap(categories: CategoryHierarchyNode[]): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parentId, siblings);
  }
  return childrenByParent;
}

/**
 * Resolve TODA a subárvore de descendentes de `categoryId` (não só filhas
 * diretas) — regra de hierarquia do orçamento (docs/26-BUDGETS.md, "Hierarquia
 * de Categoria no Orçamento": "orçamento no pai soma as filhas"). BFS bounded
 * pelo `visited` contra dado corrompido (ciclo), mesma cautela de
 * `categoryService.wouldCreateCycle` (modules/categories/service.ts).
 */
function resolveCategoryIdsWithDescendants(categoryId: string, categories: CategoryHierarchyNode[]): string[] {
  const childrenByParent = buildChildrenMap(categories);
  const visited = new Set<string>([categoryId]);
  const queue = [categoryId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return Array.from(visited);
}

/**
 * Janela do mês em America/Sao_Paulo, convertida para o instante UTC correto
 * — mesma construção de `transactionService.monthWindowUtc`
 * (modules/transactions/service.ts): `new Date(y, m, d, ...)` (getters
 * locais) é o formato que `parseInSaoPaulo`/`fromZonedTime` espera,
 * independente do timezone do host.
 */
function monthWindowUtc(year: number, month: number): DateRange {
  const startOfMonthLocal = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const startOfNextMonthLocal =
    month === 12 ? new Date(year + 1, 0, 1, 0, 0, 0, 0) : new Date(year, month, 1, 0, 0, 0, 0);

  return {
    gte: parseInSaoPaulo(startOfMonthLocal),
    lt: parseInSaoPaulo(startOfNextMonthLocal),
  };
}

/** Faixas do card de budget (docs/26-BUDGETS.md, "Estados Visuais"): Normal até 80%, Atenção 80-100%, Estourado >100%. */
function statusFromProgress(progress: number): BudgetStatus {
  if (progress > 100) return "OVER";
  if (progress > 80) return "ATTENTION";
  return "NORMAL";
}

function toProgress(plannedAmount: Prisma.Decimal, spentAmount: Prisma.Decimal): number {
  if (plannedAmount.isZero()) return 0;
  return Number(spentAmount.dividedBy(plannedAmount).times(100).toFixed(2));
}

function withProgress(budget: Budget, spentAmount: Money): BudgetWithProgress {
  const progress = toProgress(budget.plannedAmount, spentAmount);
  return { ...budget, spentAmount, progress, status: statusFromProgress(progress) };
}

/**
 * `spentAmount` DERIVADO (nunca persistido, docs/03-DATABASE.md) — soma
 * EXPENSE da categoria do budget + TODAS as descendentes, no mês/ano do
 * budget (docs/26-BUDGETS.md, "Cálculo" + "Hierarquia de Categoria no
 * Orçamento").
 */
async function spentAmount(userId: string, budget: Budget): Promise<Money> {
  const categories = await budgetRepository.listCategoryHierarchy(userId);
  const categoryIds = resolveCategoryIdsWithDescendants(budget.categoryId, categories);
  const range = monthWindowUtc(budget.year, budget.month);
  return budgetRepository.sumExpensesByCategoryIds(userId, categoryIds, range);
}

/**
 * Excluir orçamento é soft delete: a linha permanece ocupando o unique
 * (userId, categoryId, month, year). Sem reativação, recriar o orçamento do
 * mesmo período seria impossível pra sempre — P2002 com zero budgets visíveis
 * na tela. Por isso: ativo no período → erro; soft-deletado → reativa
 * (undelete + novo plannedAmount, mesma linha); ausente → insere.
 */
async function createBudget(userId: string, input: CreateBudgetData): Promise<Budget> {
  await assertBudgetableCategory(userId, input.categoryId);

  const existing = await budgetRepository.findAnyByPeriod(userId, input.categoryId, input.month, input.year);
  if (existing) {
    if (existing.deletedAt === null) {
      throw new BudgetAlreadyExistsError(input.categoryId, input.month, input.year);
    }
    const reactivated = await budgetRepository.reactivate(userId, existing.id, input.plannedAmount);
    // null = outra request reativou entre o find e o update guardado → duplicado ativo.
    if (!reactivated) throw new BudgetAlreadyExistsError(input.categoryId, input.month, input.year);
    return reactivated;
  }

  try {
    return await budgetRepository.create(userId, input);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new BudgetAlreadyExistsError(input.categoryId, input.month, input.year, error);
    }
    throw error;
  }
}

async function updateBudget(userId: string, id: string, input: UpdateBudgetData): Promise<Budget> {
  const existing = await budgetRepository.findById(userId, id);
  if (!existing) throw new BudgetNotFoundError(id);

  if (input.categoryId !== undefined) await assertBudgetableCategory(userId, input.categoryId);

  try {
    const updated = await budgetRepository.update(userId, id, input);
    if (!updated) throw new BudgetNotFoundError(id);
    return updated;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new BudgetAlreadyExistsError(
        input.categoryId ?? existing.categoryId,
        input.month ?? existing.month,
        input.year ?? existing.year,
        error,
      );
    }
    throw error;
  }
}

/** Soft delete (mesma convenção de accounts/categories) — não bloqueia por Transactions existentes (budget é só leitura sobre elas). */
async function deleteBudget(userId: string, id: string): Promise<void> {
  const deleted = await budgetRepository.softDelete(userId, id);
  if (!deleted) throw new BudgetNotFoundError(id);
}

/**
 * Orçamentos do período + `spentAmount`/progresso/status de cada — 3 queries
 * fixas independente de N budgets (categorias, budgets, soma agrupada por
 * categoria), sem N+1 (docs/26-BUDGETS.md, "Performance": "preferir
 * agregações no backend"). `categoryId` (opcional) narrow pra uma única
 * categoria — filtro global "categoria" de `/reports` (docs/28-REPORTS.md
 * "Filtros Globais"), aplicado na query via `budgetRepository.listByPeriod`.
 */
async function listWithProgress(
  userId: string,
  year: number,
  month: number,
  categoryId?: string,
): Promise<BudgetWithProgress[]> {
  const budgets = await budgetRepository.listByPeriod(userId, year, month, categoryId);
  if (budgets.length === 0) return [];

  const categories = await budgetRepository.listCategoryHierarchy(userId);
  const range = monthWindowUtc(year, month);
  const sumsByCategory = await budgetRepository.groupExpensesByCategoryInRange(userId, range);

  return budgets.map((budget) => {
    const categoryIds = resolveCategoryIdsWithDescendants(budget.categoryId, categories);
    const spent = categoryIds.reduce(
      (total, categoryId) => total.plus(sumsByCategory.get(categoryId) ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    return withProgress(budget, spent);
  });
}

export const budgetService = {
  createBudget,
  updateBudget,
  deleteBudget,
  spentAmount,
  listWithProgress,
};
