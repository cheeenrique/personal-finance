"use client";

import { useState } from "react";
import { Plus, Search, Tag as TagIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTagAction } from "@/modules/tags/actions";
import { notifySuccess } from "@/lib/toast";
import { TagChip } from "./tag-chip";
import { TagFormModal } from "./tag-form-modal";
import type { Tag } from "@/generated/prisma/client";

type TagGridProps = {
  tags: Tag[];
};

/**
 * Board de tags (docs/06-SCREENS.md, "Tags"): busca instantânea + grade
 * fluida de chips + modais de criar/editar/excluir. Sem paginação — a rota
 * carrega todas as tags do usuário de uma vez (mesma decisão de Contas/
 * Cartões/Categorias, docs/06-SCREENS.md "DataTable").
 */
export function TagGrid({ tags }: TagGridProps) {
  const [search, setSearch] = useState("");
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);

  function openCreate() {
    setEditingTag(null);
    setFormOpen(true);
  }

  function openEdit(tag: Tag) {
    setEditingTag(tag);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingTag) return;
    const result = await deleteTagAction(deletingTag.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Tag excluída");
  }

  if (tags.length === 0) {
    return (
      <>
        <EmptyState
          icon={TagIcon}
          title="Nenhuma tag ainda"
          description="Crie marcadores livres para contextualizar suas transações — viagens, projetos, pessoas."
          actionLabel="+ Criar tag"
          onAction={openCreate}
        />
        <TagFormModal open={isFormOpen} onOpenChange={setFormOpen} tag={editingTag} />
      </>
    );
  }

  const query = search.trim().toLowerCase();
  const filteredTags = query ? tags.filter((tag) => tag.name.toLowerCase().includes(query)) : tags;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar tag…"
            aria-label="Buscar tag"
            className="pl-8"
          />
        </div>

        <Button type="button" variant="accent" onClick={openCreate} className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          Nova tag
        </Button>
      </div>

      {filteredTags.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhuma tag encontrada"
          description={`Nenhum resultado para "${search.trim()}".`}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {filteredTags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onEdit={() => openEdit(tag)}
              onDelete={() => setDeletingTag(tag)}
            />
          ))}
        </div>
      )}

      <TagFormModal open={isFormOpen} onOpenChange={setFormOpen} tag={editingTag} />

      <ConfirmDialog
        open={deletingTag !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTag(null);
        }}
        title={`Excluir "${deletingTag?.name ?? ""}"`}
        description="A tag deixará de estar disponível para novas transações. Transações que já usam esta tag mantêm o histórico."
        onConfirm={handleDelete}
      />
    </div>
  );
}
