import { AssetEvolutionChart } from "@/components/assets/asset-evolution-chart";
import type { EvolutionChartPoint } from "@/components/assets/types";

type PatrimonyReportSectionProps = {
  points: EvolutionChartPoint[];
};

/**
 * "Patrimônio" (docs/28-REPORTS.md, "Relatório de Patrimônio") — série de
 * `AssetSnapshot` via `assetService.evolutionTotal` (reusado por
 * `reportService.patrimonyEvolution`). Sem filtro de período: o endpoint
 * sempre devolve o histórico completo de snapshots (não aceita `dateFrom`/
 * `dateTo`, ver `modules/reports/service.ts`). `AssetEvolutionChart` já é o
 * componente dedicado a série única de valor (@/components/assets), reusado
 * aqui em vez de duplicar o desenho do gráfico.
 */
export function PatrimonyReportSection({ points }: PatrimonyReportSectionProps) {
  return (
    <AssetEvolutionChart
      title="Patrimônio"
      points={points}
      emptyMessage="Nenhum snapshot de patrimônio registrado ainda."
    />
  );
}
