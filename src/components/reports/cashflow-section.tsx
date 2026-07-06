import type { CashflowReport, IncomeExpenseMonthPoint } from "@/modules/reports/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppLineChart, type LineChartPoint } from "@/components/shared/charts/line-chart";
import { formatBRL } from "@/lib/money/format";
import { TIMEZONE } from "@/lib/date/timezone";
import { cn } from "@/lib/utils";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: TIMEZONE });

/** "jan", "fev"... a partir de `year`/`month` (1-12) — mesma receita de `dashboard/monthly-evolution-chart.tsx` `monthLabel` (não exportada de lá, recriada aqui). */
function monthLabel(year: number, month: number): string {
  const label = MONTH_LABEL_FORMATTER.format(new Date(year, month - 1, 1));
  return label.replace(".", "").replace(/^\w/, (char) => char.toUpperCase());
}

type CashflowSectionProps = {
  /** Agregado do período selecionado pelos filtros globais (`reportService.cashflow`). */
  summary: CashflowReport;
  /** Série dos 12 meses do ano de referência (`reportService.incomeVsExpenseByMonth`) — o range de datas do filtro não se aplica aqui, o endpoint só aceita `year` inteiro. */
  monthlyPoints: IncomeExpenseMonthPoint[];
};

/**
 * "Fluxo de Caixa" (docs/28-REPORTS.md, "Relatório de Fluxo de Caixa") —
 * combina os dois relatórios do backend que cobrem esta seção: o agregado
 * (`cashflow`) vira o resumo de topo, a série mensal (`incomeVsExpenseByMonth`)
 * vira a linha. `AppLineChart` já é o componente documentado como reusado
 * pelo Dashboard e por Reports (ver seu próprio comentário de doc).
 */
export function CashflowSection({ summary, monthlyPoints }: CashflowSectionProps) {
  const income = summary.income.toNumber();
  const expense = summary.expense.toNumber();
  const net = summary.net.toNumber();

  const hasMovement = monthlyPoints.some((point) => !point.income.isZero() || !point.expense.isZero());
  const data: LineChartPoint[] = monthlyPoints.map((point) => ({
    label: monthLabel(point.year, point.month),
    income: point.income.toNumber(),
    expense: point.expense.toNumber(),
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3">
        <SummaryStat label="Receitas (período)" value={income} tone="success" />
        <SummaryStat label="Despesas (período)" value={expense} tone="danger" />
        <SummaryStat label="Saldo (período)" value={net} tone={net >= 0 ? "success" : "danger"} />
      </div>

      <ChartWrapper
        title="Fluxo de caixa"
        empty={!hasMovement}
        emptyMessage="Nenhuma movimentação registrada neste ano ainda."
        legend={
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success" aria-hidden="true" />
              Receitas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
              Despesas
            </span>
          </>
        }
      >
        <AppLineChart data={data} />
      </ChartWrapper>
    </div>
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
