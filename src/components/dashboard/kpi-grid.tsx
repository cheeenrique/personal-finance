import { Banknote, Clock3, Landmark, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { formatBRL } from "@/lib/money/format";

export type KPIGridData = {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  unpaidExpense: number;
  monthlyResult: number;
  totalPatrimony: number;
};

/**
 * 6 KPIs obrigatórios do Dashboard (docs/11-DASHBOARD.md, "2. KPIs
 * Principais"). Grid 3 colunas desktop (`lg:`) / 2 tablet (`sm:`) / 1 mobile
 * — nunca mostra mais de uma informação principal por card.
 */
export function KPIGrid({ data }: { data: KPIGridData }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KPICard icon={Wallet} title="Saldo atual" value={formatBRL(data.totalBalance)} tone="neutral" />
      <KPICard icon={TrendingUp} title="Receitas do mês" value={formatBRL(data.monthlyIncome)} tone="success" />
      <KPICard icon={TrendingDown} title="Despesas do mês" value={formatBRL(data.monthlyExpense)} tone="danger" />
      <KPICard icon={Clock3} title="Previsto / A pagar" value={formatBRL(data.unpaidExpense)} tone="warning" />
      <KPICard
        icon={Banknote}
        title="Resultado do mês"
        value={formatBRL(data.monthlyResult)}
        tone={data.monthlyResult >= 0 ? "success" : "danger"}
      />
      <KPICard icon={Landmark} title="Patrimônio total" value={formatBRL(data.totalPatrimony)} tone="asset" />
    </div>
  );
}
