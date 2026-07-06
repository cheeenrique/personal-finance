"use client";

import { MoreVertical, Pencil, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FOCUS_RING_CLASS, cn } from "@/lib/utils";
import { DEFAULT_TAG_COLOR } from "./tag-config";
import type { Tag } from "@/generated/prisma/client";

type TagChipProps = {
  tag: Tag;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Chip de tag (docs/06-SCREENS.md, "Tags": "Chips (Badge) com cor própria de
 * cada tag, ícone de editar e menu (⋮) com excluir"). Nome sempre visível
 * junto da cor — cor nunca é único indicador.
 */
export function TagChip({ tag, onEdit, onDelete }: TagChipProps) {
  const color = tag.color || DEFAULT_TAG_COLOR;

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full py-1 pr-1.5 pl-3"
      style={{ backgroundColor: `${color}29`, color }}
    >
      <span className="text-[13px] font-bold">{tag.name}</span>

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${tag.name}`}
        className={cn(
          "flex size-6 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100",
          FOCUS_RING_CLASS,
        )}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Mais ações para ${tag.name}`}
              className={cn(
                "flex size-6 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100",
                FOCUS_RING_CLASS,
              )}
            />
          }
        >
          <MoreVertical className="size-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
