"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartWrapper } from "@/components/shared/chart-wrapper";
import type { EvolutionChartPoint } from "./types";

type AssetEvolutionChartProps = {
  title: string;
  points: EvolutionChartPoint[];
  emptyMessage?: string;
};

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
        <LineChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
            width={48}
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
