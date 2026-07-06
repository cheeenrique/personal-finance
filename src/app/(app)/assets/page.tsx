import { Landmark } from "lucide-react";

import { auth } from "@/lib/auth";
import { assetService } from "@/modules/assets/service";
import { KPICard } from "@/components/shared/kpi-card";
import { AssetEvolutionChart } from "@/components/assets/asset-evolution-chart";
import { AssetCompositionChart } from "@/components/assets/asset-composition-chart";
import { AssetGrid } from "@/components/assets/asset-grid";
import type { AssetCardData, EvolutionChartPoint } from "@/components/assets/types";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";

/**
 * `/assets` (docs/27-ASSETS.md). Server Component: lê os services de
 * `modules/assets` direto (sem passar por Server Action — Server Actions
 * aqui são só para mutations disparadas pelo client, ver docs/99-CLAUDE.md
 * "Regra de Ouro"). `Prisma.Decimal` é convertido pra string/number na borda
 * antes de descer pra Client Components (RSC não serializa instância de
 * classe).
 */
export default async function AssetsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [assets, totalPatrimony, evolutionTotal] = await Promise.all([
    assetService.list(userId),
    assetService.totalPatrimony(userId),
    assetService.evolutionTotal(userId),
  ]);

  const assetCards: AssetCardData[] = assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    purchaseValue: asset.purchaseValue.toString(),
    currentValue: asset.currentValue.toString(),
    purchaseDate: asset.purchaseDate,
    notes: asset.notes,
  }));

  const evolutionPoints: EvolutionChartPoint[] = evolutionTotal.map((point) => ({
    label: formatDateSaoPaulo(point.date),
    value: point.total.toNumber(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <KPICard
        icon={Landmark}
        title="Patrimônio Total"
        value={formatBRL(totalPatrimony.toString())}
        tone="asset"
        className="max-w-sm"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AssetEvolutionChart
          title="Evolução do patrimônio"
          points={evolutionPoints}
          emptyMessage="Nenhum histórico de valor registrado ainda."
        />
        <AssetCompositionChart assets={assetCards} />
      </div>

      <AssetGrid assets={assetCards} />
    </div>
  );
}
