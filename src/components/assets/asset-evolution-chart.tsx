"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartWrapper } from "@/components/shared/chart-wrapper";
import type { EvolutionChartPoint } from "./types";

type AssetEvolutionChartProps = {
  title: string;
  points: EvolutionChartPoint[];
  emptyMessage?: string;
};

/** Tick compacto do eixo Y — "R$ 1.2k"/"R$ 15k"/"R$ 1.1M" (mesmo formato de `AppLineChart`, componente próprio — ver comentário abaixo). */
function formatCompactBRL(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `R$ ${value}`;
}

/**
 * Série única de valor ao longo do tempo (patrimônio total ou de um asset
 * isolado — docs/27-ASSETS.md, "Evolução"/"Detalhe do Asset"). `AppLineChart`
 * (@/components/shared/charts/line-chart) é dedicado a receita vs. despesa
 * (duas séries obrigatórias); patrimônio é sempre uma série só, então este
 * componente compõe `recharts` direto seguindo a mesma receita visual (grid,
 * eixos, tooltip BRL) — sem alterar o chart compartilhado usado por outras
 * telas. Cor travada em `--on-asset` (design/PERSONAL_FINANCE_LAYOUT_HANDOFF.md,
 * "Gráfico" > "Cores por tipo": "Patrimônio: --pf-on-asset").
 */
export function AssetEvolutionChart({ title, points, emptyMessage }: AssetEvolutionChartProps) {
  const hasData = points.length > 0;

  return (
    <ChartWrapper
      title={title}
      empty={!hasData}
      emptyMessage={emptyMessage ?? "Nenhum dado disponível para este período."}
      legend={
        hasData && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-on-asset" aria-hidden="true" />
            Patrimônio
          </span>
        )
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={formatCompactBRL}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--foreground)", fontWeight: 700 }}
            formatter={(value) =>
              new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value))
            }
          />
          <Line type="monotone" dataKey="value" name="Patrimônio" stroke="var(--on-asset)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
