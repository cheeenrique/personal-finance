"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { formatBRL } from "@/lib/money/format";

/**
 * Shape serializável pra atravessar o boundary RSC → client — `projectionService.forecast`
 * já retorna `number` puro (sem `Prisma.Decimal`), sem conversão extra no server.
 */
export type ClientCashflowProjection = {
  points: Array<{ date: string; balance: number }>;
  firstNegativeDate: string | null;
  lowestBalance: number;
  horizonDays: number;
};

type CashflowProjectionChartProps = {
  projection: ClientCashflowProjection;
};

/** `date` é `YYYY-MM-DD` fixo (sem `Date`/timeZone) — mesma cautela de `monthly-evolution-chart.tsx`: parsear com `new Date()` num servidor UTC desloca o dia. */
function formatDayLabel(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

function formatFriendlyDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

/** Tick compacto do eixo Y, com sinal — saldo projetado pode ficar negativo. */
function formatCompactBRL(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}R$ ${abs}`;
}

/**
 * "Projeção de saldo (30 dias)" (`projectionService.forecast`) — área do
 * saldo de conta projetado dia a dia. Linha de referência em R$0 + marcador
 * no primeiro dia negativo (`firstNegativeDate`), com legenda textual abaixo
 * do gráfico avisando a data — cor sozinha nunca é o único indicador
 * (docs/04-DESIGN_SYSTEM.md, "Cores de Alerta").
 */
export function CashflowProjectionChart({ projection }: CashflowProjectionChartProps) {
  const { points, firstNegativeDate } = projection;
  const isEmpty = points.length === 0;

  const data = points.map((point) => ({ label: formatDayLabel(point.date), balance: point.balance }));
  const negativePoint = firstNegativeDate ? points.find((point) => point.date === firstNegativeDate) : undefined;

  return (
    <ChartWrapper
      title="Projeção de saldo (30 dias)"
      empty={isEmpty}
      emptyMessage="Sem dados suficientes para projetar o saldo."
      height={280}
    >
      <div className="flex h-full flex-col gap-2">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
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
                formatter={(value) => [formatBRL(Number(value)), "Saldo"]}
              />
              <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="balance"
                name="Saldo"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#balanceAreaFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              {negativePoint && (
                <ReferenceDot
                  x={formatDayLabel(negativePoint.date)}
                  y={negativePoint.balance}
                  r={4}
                  fill="var(--destructive)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {firstNegativeDate && (
          <p className="text-[11.5px] font-bold text-on-danger">
            Saldo fica negativo em {formatFriendlyDate(firstNegativeDate)}.
          </p>
        )}
      </div>
    </ChartWrapper>
  );
}
