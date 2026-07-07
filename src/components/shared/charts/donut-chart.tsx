"use client";

import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatBRL } from "@/lib/money/format";

export type DonutChartSlice = {
  label: string;
  value: number;
  /** Cor resolvida (hex ou `var(--token)`) — cada tela decide a paleta (categorias/tipos de patrimônio). */
  color: string;
};

type AppDonutChartProps = {
  data: DonutChartSlice[];
  /** Conteúdo sobreposto no centro do donut (ex.: total agregado) — quem compõe a tela decide se usa. */
  centerLabel?: ReactNode;
};

/**
 * Composição por categoria (Dashboard "Gastos por categoria", Assets
 * "Composição do patrimônio"). Legenda em si fica por conta de quem compõe o
 * gráfico (lista ranqueada, chips no header, etc. — docs/04-DESIGN_SYSTEM.md,
 * "Gráficos"). Tooltip sempre mostra categoria, valor em BRL e % do total.
 */
export function AppDonutChart({ data, centerLabel }: AppDonutChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="relative size-full">
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
            formatter={(value, name) => {
              const percent = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : "0.0";
              return [`${formatBRL(Number(value))} (${percent}%)`, name];
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {centerLabel && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          {centerLabel}
        </div>
      )}
    </div>
  );
}
