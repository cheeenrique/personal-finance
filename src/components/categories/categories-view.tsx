"use client";

import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteCategoryAction } from "@/modules/categories/actions";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { CategoryType } from "@/generated/prisma/enums";
import { notifyError, notifySuccess } from "@/lib/toast";
import { CATEGORY_TYPE_LABELS } from "./category-config";
import { CategoryFormModal, type FlatCategory } from "./category-form-modal";
import { CategorySection } from "./category-section";

type CategoriesViewProps = {
  tree: CategoryTreeNode[];
};

/** Achata a árvore (só os campos usados pra montar as opções de "categoria pai" no form). */
function flattenCategories(nodes: CategoryTreeNode[]): FlatCategory[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, type: node.type, parentId: node.parentId },
    ...flattenCategories(node.children),
  ]);
}

/**
 * Orquestrador de `/categories` (docs/24-CATEGORIES.md): abas
 * Despesas/Receitas ("Tipos de Categoria") + árvore pai/filha por aba +
 * criar/editar (FormModal) + excluir (ConfirmDialog). `tree` vem do Server
 * Component (`categoryService.listTree`, ver `app/(app)/categories/page.tsx`)
 * — `revalidatePath("/categories")` já roda dentro de cada Server Action
 * (modules/categories/actions.ts), sem necessidade de refetch manual aqui.
 */
export function CategoriesView({ tree }: CategoriesViewProps) {
  const [activeTab, setActiveTab] = useState<CategoryType>(CategoryType.EXPENSE);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryTreeNode | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<CategoryTreeNode | null>(null);

  const allCategories = useMemo(() => flattenCategories(tree), [tree]);
  const expenseRoots = useMemo(() => tree.filter((node) => node.type === CategoryType.EXPENSE), [tree]);
  const incomeRoots = useMemo(() => tree.filter((node) => node.type === CategoryType.INCOME), [tree]);

  function openCreate(type: CategoryType) {
    setEditingCategory(null);
    setActiveTab(type);
    setFormOpen(true);
  }

  function openEdit(category: CategoryTreeNode) {
    setEditingCategory(category);
    setFormOpen(true);
  }

  /**
   * Não relança o erro pro `ConfirmDialog` — a mensagem genérica dele
   * ("não foi possível concluir") esconderia justamente os casos que essa
   * tela precisa deixar claros (`CATEGORY_HAS_CHILDREN`,
   * `CATEGORY_SYSTEM_FALLBACK`, ver modules/categories/errors.ts). Mesmo
   * padrão de `use-transaction-mutations.ts`: mostra a mensagem específica
   * via toast e fecha o diálogo nos dois casos.
   */
  async function handleDelete() {
    if (!deletingCategory) return;

    const result = await deleteCategoryAction(deletingCategory.id);
    if (!result.success) {
      notifyError(result.error.message);
      setDeletingCategory(null);
      return;
    }

    notifySuccess("Categoria excluída");
    setDeletingCategory(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CategoryType)}>
        <TabsList>
          <TabsTrigger value={CategoryType.EXPENSE}>{CATEGORY_TYPE_LABELS[CategoryType.EXPENSE]}s</TabsTrigger>
          <TabsTrigger value={CategoryType.INCOME}>{CATEGORY_TYPE_LABELS[CategoryType.INCOME]}s</TabsTrigger>
        </TabsList>

        <TabsContent value={CategoryType.EXPENSE} className="pt-3">
          <CategorySection
            type={CategoryType.EXPENSE}
            roots={expenseRoots}
            onCreate={() => openCreate(CategoryType.EXPENSE)}
            onEdit={openEdit}
            onDelete={setDeletingCategory}
          />
        </TabsContent>

        <TabsContent value={CategoryType.INCOME} className="pt-3">
          <CategorySection
            type={CategoryType.INCOME}
            roots={incomeRoots}
            onCreate={() => openCreate(CategoryType.INCOME)}
            onEdit={openEdit}
            onDelete={setDeletingCategory}
          />
        </TabsContent>
      </Tabs>

      <CategoryFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editingCategory}
        allCategories={allCategories}
        defaultType={activeTab}
      />

      <ConfirmDialog
        open={deletingCategory !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(null);
        }}
        title={`Excluir "${deletingCategory?.name ?? ""}"?`}
        description="Transações já lançadas com essa categoria continuam existindo para histórico."
        onConfirm={handleDelete}
      />
    </div>
  );
}
