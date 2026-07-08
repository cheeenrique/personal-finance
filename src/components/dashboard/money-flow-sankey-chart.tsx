import { TriangleAlert } from "lucide-react";

import { SANKEY_HUB_NAME, SANKEY_LEFTOVER_NAME, type SankeyFlowReport } from "@/modules/reports/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppSankeyChart, type AppSankeyChartNode } from "@/components/shared/charts/sankey-chart";
import { resolveCategoryColor } from "@/components/shared/charts/category-palette";
import { formatBRL } from "@/lib/money/format";

const HUB_COLOR = "var(--foreground)";
const LEFTOVER_COLOR = "var(--success)";

type MoneyFlowSankeyChartProps = {
  data: SankeyFlowReport;
};

/**
 * "Fluxo de dinheiro" do Dashboard — Sankey receita por categoria → hub
 * "Renda" → despesa por categoria + "Sobrou" (docs/11-DASHBOARD.md, "5.
 * Gráficos e Análises"). Cor por categoria reaproveita a MESMA paleta cíclica
 * do donut "Gastos por categoria" — como `reportService.sankeyFlow` usa
 * `categoryTotals` (já ordenado por total desc) pros dois lados, a cor na
 * posição N aqui é a mesma categoria na posição N do donut, quando os dois
 * mostram o mesmo período. Hub e "Sobrou" têm cor fixa (neutro/verde) — não
 * competem com o ciclo de categorias.
 *
 * Déficit (despesa > receita no período): `data.isDeficit` vem `true` e
 * "Sobrou" não existe no diagrama (Sankey não lida bem com valor negativo,
 * ver `sankeyFlow`) — aviso mostrado na legenda do card em vez de tentar
 * encaixar no gráfico.
 */
export function MoneyFlowSankeyChart({ data }: MoneyFlowSankeyChartProps) {
  const isEmpty = data.links.length === 0;

  // Sem contador mutável: a posição de cada lado (receita/despesa) dentro da
  // paleta é derivada do índice em `data.nodes` relativo ao hub — cada lado
  // recicla a paleta a partir do 0 (docs 02-dry-kiss-yagni, sem variável
  // reassinalada durante o render).
  const hubIndex = data.nodes.findIndex((node) => node.name === SANKEY_HUB_NAME);
  const nodes: AppSankeyChartNode[] = data.nodes.map((node, index) => {
    if (node.name === SANKEY_HUB_NAME) return { name: node.name, color: HUB_COLOR };
    if (node.name === SANKEY_LEFTOVER_NAME) return { name: node.name, color: LEFTOVER_COLOR };

    const categoryIndex = index < hubIndex ? index : index - hubIndex - 1;
    return { name: node.name, color: resolveCategoryColor(categoryIndex) };
  });

  return (
    <ChartWrapper
      title="Fluxo de dinheiro"
      empty={isEmpty}
      emptyMessage="Sem fluxo no período."
      height={340}
      legend={
        data.isDeficit && (
          <span className="inline-flex items-center gap-1.5 text-destructive">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            Déficit: {formatBRL(data.deficit.toNumber())}
          </span>
        )
      }
    >
      <AppSankeyChart nodes={nodes} links={data.links} />
    </ChartWrapper>
  );
}
