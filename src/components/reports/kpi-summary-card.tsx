import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { formatBRL } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type KpiSummaryCardProps = {
  income: number;
  expense: number;
  net: number;
};

/**
 * "Resumo do período" — os 3 KPIs (Receitas/Despesas/Saldo) que antes viviam
 * dentro de `CashflowSection` (docs/28-REPORTS.md, "Relatório de Fluxo de
 * Caixa"), extraídos pra card próprio pra rebalancear a linha 1 de
 * `/reports` (3 colunas de peso parecido em vez de 1 bloco carregando os
 * KPIs + o gráfico). `ChartWrapper` só pela borda/fundo iguais aos gráficos
 * vizinhos — não há gráfico aqui dentro.
 */
export function KpiSummaryCard({ income, expense, net }: KpiSummaryCardProps) {
  return (
    <ChartWrapper title="Resumo do período" height={280}>
      <div className="flex h-full flex-col justify-center gap-4">
        <SummaryStat label="Receitas (período)" value={income} tone="success" />
        <SummaryStat label="Despesas (período)" value={expense} tone="danger" />
        <SummaryStat label="Saldo (período)" value={net} tone={net >= 0 ? "success" : "danger"} />
      </div>
    </ChartWrapper>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-bold text-muted-foreground uppercase">{label}</p>
      <p className={cn("font-mono text-[15px] font-semibold", tone === "success" ? "text-success" : "text-destructive")}>
        {formatBRL(value)}
      </p>
    </div>
  );
}
