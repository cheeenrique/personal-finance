import { Banknote, Clock3, Landmark, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { formatBRL } from "@/lib/money/format";
import { PERIOD_OPTIONS, type PeriodPreset } from "@/components/transactions/period-presets";

export type KPIGridData = {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  unpaidExpense: number;
  monthlyResult: number;
  totalPatrimony: number;
  totalInvested: number;
};

type KPIGridProps = {
  data: KPIGridData;
  /** Período selecionado no filtro do Dashboard — só afeta o título dos KPIs de FLUXO (receita/despesa/previsto/resultado); saldo e patrimônio são snapshot ("atuais", sempre iguais independente do período). */
  period: PeriodPreset;
};

/**
 * 7 KPIs obrigatórios do Dashboard (docs/11-DASHBOARD.md, "2. KPIs
 * Principais"). Grid 3 colunas desktop (`lg:`) / 2 tablet (`sm:`) / 1 mobile
 * — nunca mostra mais de uma informação principal por card. Títulos dos KPIs
 * de fluxo (receita/despesa/previsto/resultado) reforçam "do mês" só no
 * default ("this_month", ZERO diferença visual do texto de antes do filtro
 * de período existir); qualquer outro período troca pro nome do preset entre
 * parênteses, ex.: "Receitas (Este ano)" — menos ambíguo do que manter "do
 * mês" com um período que não é um mês.
 */
export function KPIGrid({ data, period }: KPIGridProps) {
  const isCurrentMonth = period === "this_month";
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "";

  const incomeTitle = isCurrentMonth ? "Receitas do mês" : `Receitas (${periodLabel})`;
  const expenseTitle = isCurrentMonth ? "Despesas do mês" : `Despesas (${periodLabel})`;
  const unpaidTitle = isCurrentMonth ? "Previsto / A pagar" : `Previsto / A pagar (${periodLabel})`;
  const resultTitle = isCurrentMonth ? "Resultado do mês" : `Resultado (${periodLabel})`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KPICard
        icon={Wallet}
        title="Saldo atual"
        value={formatBRL(data.totalBalance)}
        tone={data.totalBalance < 0 ? "danger" : "neutral"}
      />
      <KPICard icon={TrendingUp} title={incomeTitle} value={formatBRL(data.monthlyIncome)} tone="success" />
      <KPICard icon={TrendingDown} title={expenseTitle} value={formatBRL(data.monthlyExpense)} tone="danger" />
      <KPICard icon={Clock3} title={unpaidTitle} value={formatBRL(data.unpaidExpense)} tone="warning" />
      <KPICard
        icon={Banknote}
        title={resultTitle}
        value={formatBRL(data.monthlyResult)}
        tone={data.monthlyResult >= 0 ? "success" : "danger"}
      />
      <KPICard icon={Landmark} title="Patrimônio total" value={formatBRL(data.totalPatrimony)} tone="asset" />
      <KPICard icon={PiggyBank} title="Total investido" value={formatBRL(data.totalInvested)} tone="asset" />
    </div>
  );
}
