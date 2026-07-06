import { CategoryType } from "@/generated/prisma/enums";
import type { CategoryTreeNode } from "@/modules/categories/types";
import type { TotalEvolutionPoint } from "@/modules/assets/types";
import type { EntitySelectOption } from "@/components/forms/entity-select";
import type { EvolutionChartPoint } from "@/components/assets/types";
import { TIMEZONE } from "@/lib/date/timezone";

/**
 * Achata a árvore de categorias em opções de `EntitySelect` (indent "— " por
 * profundidade, agrupado por Receita/Despesa) — mesma receita de
 * `components/transactions/use-transactions-reference-data.ts`
 * `flattenCategories`, mas recomputada aqui: aquele hook busca via Server
 * Action client-side (`useEffect`), enquanto `/reports` lê `categoryService`
 * direto num Server Component (ver `page.tsx`) — contextos diferentes, sem
 * como importar o hook client-only.
 */
export function flattenCategoryOptions(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    {
      value: node.id,
      label: `${"— ".repeat(depth)}${node.name}`,
      group: node.type === CategoryType.INCOME ? "Receita" : "Despesa",
    },
    ...flattenCategoryOptions(node.children, depth + 1),
  ]);
}

/** `id -> nome`, usado pra resolver `categoryId` do orçamento em nome exibível (ver `budget-report-table.tsx`). */
export function buildCategoryNameMap(nodes: CategoryTreeNode[]): Map<string, string> {
  return new Map(flattenCategoryOptions(nodes).map((option) => [option.value, option.label.replace(/^(— )+/, "")]));
}

const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TIMEZONE });

/** `TotalEvolutionPoint[]` (Decimal) → `EvolutionChartPoint[]` (número) na borda, pro `AssetEvolutionChart` (client). */
export function toEvolutionChartPoints(points: TotalEvolutionPoint[]): EvolutionChartPoint[] {
  return points.map((point) => ({
    label: DAY_MONTH_FORMATTER.format(point.date),
    value: point.total.toNumber(),
  }));
}
