"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatBRL } from "@/lib/money/format";

export type LineChartPoint = {
  label: string;
  income: number;
  expense: number;
};

/** Tick compacto do eixo Y — "R$ 1.2k"/"R$ 15k"/"R$ 1.1M". Evita cortar dígito com valores de 5+ casas. */
function formatCompactBRL(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `R$ ${value}`;
}

/**
 * Receita vs. despesa (Dashboard "Evolução mensal", Reports "Fluxo de
 * Caixa"). Cores travadas no design system: receita `--success`, despesa
 * `--destructive` (docs/04-DESIGN_SYSTEM.md, "Gráficos"). Área suave sob cada
 * linha (gradiente leve) + tooltip com mês/receitas/despesas em BRL.
 */
export function AppLineChart({ data }: { data: LineChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0} />
          </linearGradient>
        </defs>

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
          labelStyle={{ color: "var(--foreground)", fontWeight: 700, marginBottom: 4 }}
          formatter={(value, name) => [formatBRL(Number(value)), name]}
        />
        <Area
          type="monotone"
          dataKey="income"
          name="Receitas"
          stroke="var(--success)"
          strokeWidth={2}
          fill="url(#incomeAreaFill)"
          dot={{ r: 3, fill: "var(--success)", strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="expense"
          name="Despesas"
          stroke="var(--destructive)"
          strokeWidth={2}
          fill="url(#expenseAreaFill)"
          dot={{ r: 3, fill: "var(--destructive)", strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
