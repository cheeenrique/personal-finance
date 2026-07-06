import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppDonutChart, type DonutChartSlice } from "@/components/shared/charts/donut-chart";
import { cn } from "@/lib/utils";
import { ASSET_TYPE_CHART_COLORS, ASSET_TYPE_GROUP_LABELS, ASSET_TYPE_GROUP_ORDER } from "./asset-config";
import type { AssetCardData } from "./types";

type AssetCompositionChartProps = {
  assets: AssetCardData[];
};

/** "Composição do patrimônio" — donut por `AssetType` (docs/27-ASSETS.md, "Gráficos" > "Composição do patrimônio"). */
export function AssetCompositionChart({ assets }: AssetCompositionChartProps) {
  const slices: DonutChartSlice[] = ASSET_TYPE_GROUP_ORDER.map((type) => ({
    label: ASSET_TYPE_GROUP_LABELS[type],
    value: assets
      .filter((asset) => asset.type === type)
      .reduce((sum, asset) => sum + Number(asset.currentValue), 0),
    color: ASSET_TYPE_CHART_COLORS[type],
  })).filter((slice) => slice.value > 0);

  const isEmpty = slices.length === 0;

  return (
    <ChartWrapper
      title="Composição do patrimônio"
      empty={isEmpty}
      emptyMessage="Nenhum ativo cadastrado ainda."
      legend={
        !isEmpty && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {slices.map((slice) => (
              <span key={slice.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn("size-2 rounded-full")} style={{ backgroundColor: slice.color }} aria-hidden="true" />
                {slice.label}
              </span>
            ))}
          </div>
        )
      }
    >
      <AppDonutChart data={slices} />
    </ChartWrapper>
  );
}
