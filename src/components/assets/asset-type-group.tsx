import { AssetCard } from "./asset-card";
import type { AssetCardData } from "./types";

type AssetTypeGroupProps = {
  label: string;
  assets: AssetCardData[];
  onEdit: (asset: AssetCardData) => void;
  onDelete: (asset: AssetCardData) => void;
};

/** Grupo de assets de um mesmo `AssetType` (docs/27-ASSETS.md, "Lista de Assets": "Exibidos como cards agrupados por tipo"). */
export function AssetTypeGroup({ label, assets, onEdit, onDelete }: AssetTypeGroupProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-extrabold tracking-[0.05em] text-muted-foreground uppercase">{label}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} onEdit={() => onEdit(asset)} onDelete={() => onDelete(asset)} />
        ))}
      </div>
    </div>
  );
}
