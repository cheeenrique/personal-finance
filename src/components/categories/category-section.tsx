"use client";

import { FolderTree, Plus } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { CategoryTreeNode } from "@/modules/categories/types";
import type { CategoryType } from "@/generated/prisma/enums";
import { CATEGORY_TYPE_LABELS } from "./category-config";
import { CategoryRow } from "./category-row";

type CategorySectionProps = {
  type: CategoryType;
  roots: CategoryTreeNode[];
  onCreate: () => void;
  onEdit: (category: CategoryTreeNode) => void;
  onDelete: (category: CategoryTreeNode) => void;
};

/**
 * Seção de uma aba (Despesas/Receitas): botão "+ Nova categoria" + árvore de
 * categorias raiz com filhas aninhadas, ou Empty State quando o tipo ainda
 * não tem nenhuma categoria (docs/24-CATEGORIES.md, "Estados" > "Empty").
 */
export function CategorySection({ type, roots, onCreate, onEdit, onDelete }: CategorySectionProps) {
  const typeLabel = CATEGORY_TYPE_LABELS[type].toLowerCase();

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title={`Nenhuma categoria de ${typeLabel} ainda`}
        description="Crie a primeira categoria para organizar suas transações."
        actionLabel="+ Nova categoria"
        onAction={onCreate}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" variant="accent" onClick={onCreate} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          Nova categoria
        </Button>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
        {roots.map((root) => (
          <CategoryRow key={root.id} category={root} depth={0} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
