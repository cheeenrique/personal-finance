import { auth } from "@/lib/auth";
import { budgetService } from "@/modules/budgets/service";
import { categoryService } from "@/modules/categories/service";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { BudgetGrid } from "@/components/budgets/budget-grid";
import type { BudgetCardData } from "@/components/budgets/types";

type BudgetsPageProps = {
  searchParams: Promise<{ month?: string; year?: string }>;
};

/** Mês 1-12; fora da faixa cai no mês atual (America/Sao_Paulo) — URL adulterada não deve quebrar a tela. */
function parseMonth(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function parseYear(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

/** `parentId -> name` recursivo, achatado — só para resolver `categoryName` dos cards. */
function collectCategoryNames(nodes: CategoryTreeNode[], namesById: Map<string, string>): void {
  for (const node of nodes) {
    namesById.set(node.id, node.name);
    collectCategoryNames(node.children, namesById);
  }
}

/**
 * `/budgets` (docs/26-BUDGETS.md). Server Component: lê
 * `budgetService.listWithProgress` direto (sem passar pela Server Action —
 * Server Actions existem para mutations disparadas pelo client, docs/99-CLAUDE.md
 * "Regra de Ouro"), mesma decisão de `(app)/accounts/page.tsx`. Mês/ano vêm da
 * URL (`searchParams`), com fallback pro mês atual em America/Sao_Paulo
 * (docs/26-BUDGETS.md, "Interface": "mês atual por default").
 */
export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const params = await searchParams;
  const now = nowInSaoPaulo();
  const month = parseMonth(params.month, now.getMonth() + 1);
  const year = parseYear(params.year, now.getFullYear());

  const [budgetsWithProgress, categoryTree] = await Promise.all([
    budgetService.listWithProgress(userId, year, month),
    categoryService.listTree(userId),
  ]);

  const categoryNames = new Map<string, string>();
  collectCategoryNames(categoryTree, categoryNames);

  const budgets: BudgetCardData[] = budgetsWithProgress.map((budget) => ({
    id: budget.id,
    categoryId: budget.categoryId,
    categoryName: categoryNames.get(budget.categoryId) ?? "Categoria removida",
    month: budget.month,
    year: budget.year,
    plannedAmount: budget.plannedAmount.toString(),
    spentAmount: budget.spentAmount.toString(),
    remainingAmount: budget.plannedAmount.minus(budget.spentAmount).toString(),
    progress: budget.progress,
    status: budget.status,
  }));

  return <BudgetGrid budgets={budgets} month={month} year={year} />;
}
