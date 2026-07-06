"use client";

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type LineChartPoint = {
  label: string;
  income: number;
  expense: number;
};

/**
 * Receita vs. despesa (Dashboard "Evolução mensal", Reports "Fluxo de
 * Caixa"). Cores travadas no design system: receita `--success`, despesa
 * `--destructive` (docs/04-DESIGN_SYSTEM.md, "Gráficos").
 */
export function AppLineChart({ data }: { data: LineChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
        <Line
          type="monotone"
          dataKey="income"
          name="Receitas"
          stroke="var(--success)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="expense"
          name="Despesas"
          stroke="var(--destructive)"
          strokeWidth={2}
          dot={false}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
