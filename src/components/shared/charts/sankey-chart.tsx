"use client";

import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip, type SankeyNodeProps } from "recharts";

import { formatBRL } from "@/lib/money/format";

export type AppSankeyChartNode = { name: string; color: string };
export type AppSankeyChartLink = { source: number; target: number; value: number };

type AppSankeyChartProps = {
  nodes: AppSankeyChartNode[];
  links: AppSankeyChartLink[];
};

/**
 * Rótulo posicionado pelo LADO do nó, decidido pela topologia (não por
 * profundidade fixa — funciona pra qualquer Sankey origem→hub→destino):
 * nó sem link de ENTRADA (`sourceLinks` vazio) é ponta de origem → rótulo cai
 * na direita, dentro do vão até a próxima coluna; nó sem link de SAÍDA
 * (`targetLinks` vazio) é ponta de destino → rótulo cai na esquerda, dentro
 * do vão anterior; o resto (hub com entrada E saída) leva o rótulo acima da
 * barra — evita colidir com as duas pontas.
 */
function renderFlowNode({ x, y, width, height, payload }: SankeyNodeProps) {
  const node = payload as SankeyNodeProps["payload"] & { color: string };
  const isOrigin = node.sourceLinks.length === 0;
  const isDestination = node.targetLinks.length === 0;
  const isHub = !isOrigin && !isDestination;

  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={node.color} radius={2} />
      <text
        x={isDestination ? x - 8 : isOrigin ? x + width + 8 : x + width / 2}
        y={isHub ? y - 8 : y + height / 2}
        textAnchor={isDestination ? "end" : isOrigin ? "start" : "middle"}
        dominantBaseline={isHub ? "auto" : "middle"}
        fill="var(--foreground)"
        fontSize={11}
        fontWeight={600}
      >
        {node.name}
      </text>
    </Layer>
  );
}

/**
 * Sankey genérico do design system (docs/04-DESIGN_SYSTEM.md, "Gráficos") —
 * usado pelo "Fluxo de dinheiro" do Dashboard. Cor por nó (paleta decidida
 * por quem compõe a tela, ver `components/dashboard/money-flow-sankey-chart.tsx`);
 * link sempre neutro (`--muted-foreground` translúcido), mesma leitura do
 * donut de não deixar o "cano" competir com a cor da categoria. Tooltip
 * mostra nome + valor em BRL, tanto em cima de nó quanto de link (a lib já
 * resolve o nome do link como "origem - destino").
 */
export function AppSankeyChart({ nodes, links }: AppSankeyChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Sankey
        data={{ nodes, links }}
        node={renderFlowNode}
        link={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.25 }}
        nodePadding={20}
        nodeWidth={10}
        margin={{ top: 22, right: 8, bottom: 8, left: 8 }}
      >
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--foreground)", fontWeight: 700 }}
          formatter={(value) => formatBRL(Number(value))}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}
