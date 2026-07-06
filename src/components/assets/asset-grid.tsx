"use client";

import { useState } from "react";
import { Landmark, Plus } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteAssetAction } from "@/modules/assets/actions";
import { notifySuccess } from "@/lib/toast";
import { ASSET_TYPE_GROUP_LABELS, ASSET_TYPE_GROUP_ORDER } from "./asset-config";
import { AssetTypeGroup } from "./asset-type-group";
import { AssetFormModal } from "./asset-form-modal";
import type { AssetCardData } from "./types";

type AssetGridProps = {
  assets: AssetCardData[];
};

/**
 * Board de patrimônio: grupos por `AssetType` + modais de criar/editar/excluir
 * (docs/27-ASSETS.md, "Lista de Assets"). `revalidatePath("/assets")` já roda
 * dentro de cada Server Action (modules/assets/actions.ts) — o Next atualiza
 * os dados desta árvore automaticamente após cada ação, sem refetch manual.
 */
export function AssetGrid({ assets }: AssetGridProps) {
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetCardData | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<AssetCardData | null>(null);

  function openCreate() {
    setEditingAsset(null);
    setFormOpen(true);
  }

  function openEdit(asset: AssetCardData) {
    setEditingAsset(asset);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingAsset) return;
    const result = await deleteAssetAction(deletingAsset.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Ativo excluído");
  }

  if (assets.length === 0) {
    return (
      <>
        <EmptyState
          icon={Landmark}
          title="Nenhum patrimônio registrado"
          description="Cadastre seu primeiro ativo para acompanhar a evolução do seu patrimônio."
          actionLabel="+ Adicionar primeiro ativo"
          onAction={openCreate}
        />
        <AssetFormModal open={isFormOpen} onOpenChange={setFormOpen} asset={editingAsset} />
      </>
    );
  }

  const groups = ASSET_TYPE_GROUP_ORDER.map((type) => ({
    type,
    label: ASSET_TYPE_GROUP_LABELS[type],
    items: assets.filter((asset) => asset.type === type),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button type="button" variant="accent" size="lg" onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Novo ativo
        </Button>
      </div>

      {groups.map((group) => (
        <AssetTypeGroup
          key={group.type}
          label={group.label}
          assets={group.items}
          onEdit={openEdit}
          onDelete={setDeletingAsset}
        />
      ))}

      <AssetFormModal open={isFormOpen} onOpenChange={setFormOpen} asset={editingAsset} />

      <ConfirmDialog
        open={deletingAsset !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingAsset(null);
        }}
        title={`Excluir "${deletingAsset?.name ?? ""}"`}
        description="O ativo será removido da listagem e do patrimônio total. O histórico de valores registrado até aqui não impacta outras telas."
        onConfirm={handleDelete}
      />
    </div>
  );
}
