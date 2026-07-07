import { prisma } from "@/lib/db/client";
import { Prisma, type Budget, type Category } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";

export type CreateBudgetData = {
  categoryId: string;
  month: number;
  year: number;
  plannedAmount: string;
};

export type UpdateBudgetData = Partial<CreateBudgetData>;

/** Só os campos usados na resolução da subárvore de categorias (ver service.ts `resolveCategoryIdsWithDescendants`). */
export type CategoryHierarchyNode = { id: string; parentId: string | null };

/** Janela de datas em UTC já convertida a partir de America/Sao_Paulo (ver service.ts `monthWindowUtc`). */
export type DateRange = { gte: Date; lt: Date };

/**
 * Acesso a dados do módulo budgets. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

async function findById(userId: string, id: string): Promise<Budget | null> {
  return prisma.budget.findFirst({ where: { id, userId, deletedAt: null } });
}

/** `categoryId` (opcional) narrow pra uma única categoria — filtro global "categoria" de `/reports` (docs/28-REPORTS.md "Filtros Globais"), aplicado na query em vez de pós-filtro em memória. */
async function listByPeriod(userId: string, year: number, month: number, categoryId?: string): Promise<Budget[]> {
  return prisma.budget.findMany({
    where: { userId, year, month, deletedAt: null, ...(categoryId && { categoryId }) },
    orderBy: { createdAt: "asc" },
  });
}

async function create(userId: string, data: CreateBudgetData): Promise<Budget> {
  return prisma.budget.create({
    data: {
      userId,
      categoryId: data.categoryId,
      month: data.month,
      year: data.year,
      plannedAmount: data.plannedAmount,
    },
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * orçamento de outro usuário mesmo sabendo o `id` (docs/10-AUTH.md, "Regra
 * Principal de Segurança").
 */
async function update(userId: string, id: string, data: UpdateBudgetData): Promise<Budget | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.budget.update({
    where: { id },
    data: {
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.month !== undefined && { month: data.month }),
      ...(data.year !== undefined && { year: data.year }),
      ...(data.plannedAmount !== undefined && { plannedAmount: data.plannedAmount }),
    },
  });
}

/** Soft delete — nunca remove fisicamente (mesma convenção de accounts/categories, ver seus repository.ts). */
async function softDelete(userId: string, id: string): Promise<Budget | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.budget.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/** Categoria escopada ao usuário — usado pra validar `categoryId` do Budget antes de criar/editar. */
async function findCategoryForUser(userId: string, categoryId: string): Promise<Category | null> {
  return prisma.category.findFirst({ where: { id: categoryId, userId, deletedAt: null } });
}

/**
 * Lista achatada de categorias (só `id`/`parentId`) — insumo pra resolver a
 * subárvore de descendentes de um budget (ver service.ts
 * `resolveCategoryIdsWithDescendants`). Mesma ideia de `categoryRepository.listAll`
 * (módulo categories), mas com `select` mínimo — módulos não cross-importam
 * repository um do outro neste projeto (ver `modules/transactions/ownership.ts`),
 * por isso a query é local.
 */
async function listCategoryHierarchy(userId: string): Promise<CategoryHierarchyNode[]> {
  return prisma.category.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, parentId: true },
  });
}

/**
 * Soma de Transactions EXPENSE de um conjunto de categorias (categoria do
 * budget + descendentes) numa janela de datas — insumo de `spentAmount`
 * (1 budget). Exclui pernas de transferência (`transferId: null`) e
 * `type=CARD_PAYMENT` (já fora do filtro `type: EXPENSE`); considera só
 * `isPaid: true`, `deletedAt: null` (docs/26-BUDGETS.md, "Cálculo").
 */
async function sumExpensesByCategoryIds(
  userId: string,
  categoryIds: string[],
  range: DateRange,
): Promise<Prisma.Decimal> {
  if (categoryIds.length === 0) return new Prisma.Decimal(0);

  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      type: TransactionType.EXPENSE,
      categoryId: { in: categoryIds },
      transferId: null,
      isPaid: true,
      deletedAt: null,
      date: { gte: range.gte, lt: range.lt },
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? new Prisma.Decimal(0);
}

/**
 * Soma de Transactions EXPENSE agrupada por `categoryId` numa janela — 1
 * query pra N budgets do mesmo período (evita N+1 em `listWithProgress`,
 * ver service.ts). Mesmos filtros de `sumExpensesByCategoryIds`.
 */
async function groupExpensesByCategoryInRange(
  userId: string,
  range: DateRange,
): Promise<Map<string, Prisma.Decimal>> {
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      type: TransactionType.EXPENSE,
      transferId: null,
      isPaid: true,
      deletedAt: null,
      date: { gte: range.gte, lt: range.lt },
      categoryId: { not: null },
    },
    _sum: { amount: true },
  });

  return new Map(
    rows
      .filter((row): row is typeof row & { categoryId: string } => row.categoryId !== null)
      .map((row) => [row.categoryId, row._sum.amount ?? new Prisma.Decimal(0)]),
  );
}

export const budgetRepository = {
  findById,
  listByPeriod,
  create,
  update,
  softDelete,
  findCategoryForUser,
  listCategoryHierarchy,
  sumExpensesByCategoryIds,
  groupExpensesByCategoryInRange,
};
