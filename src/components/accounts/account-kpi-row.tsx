import { ArrowDown, ArrowUp, Wallet, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";

type StatTone = "primary" | "success" | "danger";

const TONE_TILE_CLASSES: Record<StatTone, string> = {
  primary: "bg-primary/20 text-on-primary",
  success: "bg-success/16 text-on-success",
  danger: "bg-destructive/16 text-on-danger",
};

const TONE_VALUE_CLASSES: Record<StatTone, string> = {
  primary: "text-foreground",
  success: "text-on-success",
  danger: "text-on-danger",
};

type StatCardProps = {
  icon: LucideIcon;
  tone: StatTone;
  label: string;
  value: string;
  caption: string;
  loading?: boolean;
};

/**
 * Bloco de UM KPI da faixa (handoff "Conta (Detalhe)", `statCard`) — não
 * reaproveita `shared/kpi-card.tsx` de propósito: o handoff pede ícone 30px/
 * 9px de radius, valor mono 22px e uma legenda LIVRE embaixo ("Saldo inicial:
 * R$ X" / "14 lançamentos"), diferente do slot de `variation` (seta +
 * percentual) que `KPICard` já tem fixado pro Dashboard.
 */
function StatCard({ icon: Icon, tone, label, value, caption, loading }: StatCardProps) {
  return (
    <div className={cn("flex flex-col rounded-xl border border-border bg-card p-[18px]", CARD_SHADOW_CLASS)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-[9px]",
            TONE_TILE_CLASSES[tone],
          )}
        >
          <Icon className="size-[15px]" aria-hidden="true" />
        </span>
        <p className="text-[12px] font-extrabold tracking-[0.03em] text-muted-foreground uppercase">{label}</p>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
      ) : (
        <>
          <p className={cn("mt-2.5 font-mono text-[22px] font-semibold", TONE_VALUE_CLASSES[tone])}>{value}</p>
          <p className="mt-1.5 text-[11.5px] font-semibold text-muted-foreground">{caption}</p>
        </>
      )}
    </div>
  );
}

type AccountKpiRowProps = {
  balance: string;
  initialBalance: string;
  income: string;
  incomeCount: number;
  expense: string;
  expenseCount: number;
  /** "jul", "3 meses", "período"… (`accountPeriodShortLabel`) — compõe o rótulo "Entradas · X". */
  periodShortLabel: string;
  /** Só os 2 KPIs de período (Entradas/Saídas) — saldo atual não depende do filtro. */
  loading?: boolean;
};

function lancamentosLabel(count: number): string {
  return `${count} lançamento${count === 1 ? "" : "s"}`;
}

/**
 * 3 KPIs uniformes do topo do detalhe de conta (handoff "Conta (Detalhe)",
 * grid-cols-3): Saldo atual (não depende do período), Entradas/Saídas do
 * período selecionado nos filtros (`useAccountPeriodSummary`).
 */
export function AccountKpiRow({
  balance,
  initialBalance,
  income,
  incomeCount,
  expense,
  expenseCount,
  periodShortLabel,
  loading,
}: AccountKpiRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        icon={Wallet}
        tone="primary"
        label="Saldo atual"
        value={formatBRL(balance)}
        caption={`Saldo inicial: ${formatBRL(initialBalance)}`}
      />
      <StatCard
        icon={ArrowUp}
        tone="success"
        label={`Entradas · ${periodShortLabel}`}
        value={formatBRL(income)}
        caption={lancamentosLabel(incomeCount)}
        loading={loading}
      />
      <StatCard
        icon={ArrowDown}
        tone="danger"
        label={`Saídas · ${periodShortLabel}`}
        value={formatBRL(expense)}
        caption={lancamentosLabel(expenseCount)}
        loading={loading}
      />
    </div>
  );
}
