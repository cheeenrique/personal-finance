"use client";

import { useState } from "react";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { cn } from "@/lib/utils";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { CATEGORY_TYPE_DEFAULT_COLOR } from "./category-config";
import { CategoryIcon } from "./category-icon";
import { CategoryTypeBadge } from "./category-type-badge";

type CategoryRowProps = {
  category: CategoryTreeNode;
  depth: number;
  onEdit: (category: CategoryTreeNode) => void;
  onDelete: (category: CategoryTreeNode) => void;
};

/**
 * Linha de categoria — recursiva (pai renderiza as próprias `children`
 * indentadas, docs/24-CATEGORIES.md "Lista de Categorias": árvore
 * colapsável). Ícone + cor + badge de tipo em toda linha, pai ou filha
 * (docs/24-CATEGORIES.md, "Ícones"/"Cores": toda categoria sempre tem
 * ícone e cor visíveis pra leitura rápida).
 */
export function CategoryRow({ category, depth, onEdit, onDelete }: CategoryRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = category.children.length > 0;
  const color = category.color ?? CATEGORY_TYPE_DEFAULT_COLOR[category.type];

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60",
          depth > 0 && "ml-6 border-l border-dashed border-border pl-4",
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? `Recolher ${category.name}` : `Expandir ${category.name}`}
            aria-expanded={expanded}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-4 transition-transform", expanded && "rotate-90")}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden="true" />
        )}

        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: `${color}29`, color }}
        >
          <CategoryIcon icon={category.icon} type={category.type} className="size-4" />
        </span>

        <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{category.name}</p>

        <CategoryTypeBadge type={category.type} className="hidden sm:inline-flex" />

        <IconActionButton icon={Pencil} label={`Editar ${category.name}`} onClick={() => onEdit(category)} />
        <IconActionButton
          icon={Trash2}
          tone="danger"
          label={`Excluir ${category.name}`}
          onClick={() => onDelete(category)}
        />
      </div>

      {hasChildren && expanded && (
        <div className="flex flex-col">
          {category.children.map((child) => (
            <CategoryRow key={child.id} category={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
