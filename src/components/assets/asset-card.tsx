import Link from "next/link";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { ASSET_TYPE_ICONS, ASSET_TYPE_LABELS, ASSET_TYPE_TONE_CLASSES, computeAssetVariation } from "./asset-config";
import type { AssetCardData } from "./types";

type AssetCardProps = {
  asset: AssetCardData;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Card de asset (docs/27-ASSETS.md, "Card de Asset": nome, valor atual,
 * variação, tipo). Ações (editar/excluir) ficam fora do `<Link>` de detalhe —
 * evita aninhar elemento interativo dentro de outro, mesmo padrão de
 * `components/accounts/account-card.tsx`.
 */
export function AssetCard({ asset, onEdit, onDelete }: AssetCardProps) {
  const Icon = ASSET_TYPE_ICONS[asset.type];
  const variation = computeAssetVariation(asset.purchaseValue, asset.currentValue);

  return (
    <div
      className={cn(
        "relative flex min-h-[160px] flex-col rounded-2xl border border-border bg-card",
        CARD_SHADOW_CLASS,
      )}
    >
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <IconActionButton
          icon={Pencil}
          label={`Editar ${asset.name}`}
          onClick={(event) => {
            event.preventDefault();
            onEdit();
          }}
        />
        <IconActionButton
          icon={Trash2}
          tone="danger"
          label={`Excluir ${asset.name}`}
          onClick={(event) => {
            event.preventDefault();
            onDelete();
          }}
        />
      </div>

      <Link
        href={`/assets/${asset.id}`}
        className="flex flex-1 flex-col gap-4 rounded-2xl p-5 pr-16 outline-none focus-visible:ring-3 focus-visible:ring-primary/28"
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-[34px] shrink-0 items-center justify-center rounded-[11px]",
              ASSET_TYPE_TONE_CLASSES[asset.type],
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold text-foreground">{asset.name}</p>
            <p className="truncate text-[12.5px] font-semibold text-muted-foreground">
              {ASSET_TYPE_LABELS[asset.type]}
            </p>
          </div>
        </div>

        <div className="mt-auto">
          <p className="font-mono text-2xl font-semibold text-foreground">{formatBRL(asset.currentValue)}</p>
          <p
            className={cn(
              "mt-1 inline-flex items-center gap-1 font-mono text-xs font-semibold",
              variation.positive ? "text-success" : "text-destructive",
            )}
          >
            {variation.direction === "up" ? (
              <ArrowUp className="size-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3" aria-hidden="true" />
            )}
            {variation.label}
          </p>
        </div>
      </Link>
    </div>
  );
}
