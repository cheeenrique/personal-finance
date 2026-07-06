import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDown, ArrowUp, ScrollText } from "lucide-react";

import { auth } from "@/lib/auth";
import { assetService } from "@/modules/assets/service";
import { formatBRL } from "@/lib/money/format";
import { formatDateLongSaoPaulo, formatDateSaoPaulo } from "@/lib/date/format";
import { KPICard } from "@/components/shared/kpi-card";
import { AssetEvolutionChart } from "@/components/assets/asset-evolution-chart";
import { ASSET_TYPE_ICONS, ASSET_TYPE_LABELS, ASSET_TYPE_TONE_CLASSES, computeAssetVariation } from "@/components/assets/asset-config";
import type { EvolutionChartPoint } from "@/components/assets/types";
import { cn } from "@/lib/utils";

/**
 * Detalhe do asset (docs/27-ASSETS.md, "Detalhe do Asset"): histórico de
 * valor (via `evolution`), comparação compra vs. atual, notas. Edição e
 * exclusão continuam na listagem (`/assets`) — mesmo recorte de
 * `components/accounts/account-card.tsx`, sem duplicar ação em duas telas.
 */
export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const assets = await assetService.list(userId);
  const asset = assets.find((item) => item.id === id);
  if (!asset) notFound();

  const evolution = await assetService.evolution(userId, id);

  const evolutionPoints: EvolutionChartPoint[] = evolution.map((point) => ({
    label: formatDateSaoPaulo(point.date),
    value: point.value.toNumber(),
  }));

  const Icon = ASSET_TYPE_ICONS[asset.type];
  const purchaseValue = asset.purchaseValue.toString();
  const currentValue = asset.currentValue.toString();
  const variation = computeAssetVariation(purchaseValue, currentValue);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/assets"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Patrimônio
      </Link>

      <div className="flex items-center gap-3">
        <span
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-[13px]", ASSET_TYPE_TONE_CLASSES[asset.type])}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-extrabold text-foreground">{asset.name}</h2>
          <p className="text-[13px] font-semibold text-muted-foreground">
            {ASSET_TYPE_LABELS[asset.type]} · Adquirido em {formatDateLongSaoPaulo(asset.purchaseDate)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KPICard icon={ScrollText} title="Valor de compra" value={formatBRL(purchaseValue)} tone="neutral" />
        <KPICard
          icon={variation.direction === "up" ? ArrowUp : ArrowDown}
          title="Valor atual"
          value={formatBRL(currentValue)}
          tone="asset"
          variation={variation}
        />
      </div>

      <AssetEvolutionChart
        title="Evolução do valor"
        points={evolutionPoints}
        emptyMessage="Nenhum histórico de valor registrado ainda."
      />

      {asset.notes && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-[18px]">
          <h3 className="text-sm font-extrabold text-foreground">Observações</h3>
          <p className="text-[13.5px] font-medium whitespace-pre-wrap text-muted-foreground">{asset.notes}</p>
        </div>
      )}
    </div>
  );
}
