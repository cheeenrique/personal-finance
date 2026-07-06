"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type DonutChartSlice = {
  label: string;
  value: number;
  /** Cor resolvida (hex ou `var(--token)`) — cada tela decide a paleta (categorias/tipos de patrimônio). */
  color: string;
};

/**
 * Composição por categoria (Dashboard "Gastos por categoria", Assets
 * "Composição do patrimônio"). Legenda fica fora do gráfico (inline no
 * header do `ChartWrapper`), pra caber a lista completa sem espremer o SVG.
 */
export function AppDonutChart({ data }: { data: DonutChartSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="60%"
          outerRadius="88%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((slice) => (
            <Cell key={slice.label} fill={slice.color} />
          ))}
        </Pie>
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
      </PieChart>
    </ResponsiveContainer>
  );
}
