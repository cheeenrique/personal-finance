"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreVertical, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import {
  deleteInvestmentAction,
  projectYieldAction,
  upsertCdiManualAction,
} from "@/modules/investments/actions";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { ContributeModal } from "./contribute-modal";
import { InvestmentFormModal } from "./investment-form-modal";
import type {
  AccountOptionView,
  InvestmentContributionView,
  InvestmentDetailView,
} from "./types";

type InvestmentDetailViewProps = {
  investment: InvestmentDetailView;
  accounts: AccountOptionView[];
};

const HORIZONS = [
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "1 ano" },
] as const;

/**
 * Detalhe de `/investments/[id]`: KPIs, projeção estimada, aportes, ações.
 */
export function InvestmentDetailView({ investment, accounts }: InvestmentDetailViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [contributeOpen, setContributeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [horizonDays, setHorizonDays] = useState(30);
  const [manualCdi, setManualCdi] = useState("");
  const [projection, setProjection] = useState<{
    yieldAmount: string;
    projectedValue: string;
    effectiveAnnualRatePercent: string;
  } | null>(null);
  const [projError, setProjError] = useState<string | null>(null);
  const [isProjecting, startProject] = useTransition();
  const [isSavingCdi, startSaveCdi] = useTransition();

  const percentLabel = investment.yieldPercentOfBenchmark
    ? `${Number(investment.yieldPercentOfBenchmark).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
    : "—";

  const columns: DataTableColumn<InvestmentContributionView>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Data",
        render: (row) => formatDateSaoPaulo(row.date),
      },
      { key: "description", header: "Descrição", render: (row) => row.description },
      {
        key: "account",
        header: "Conta",
        render: (row) => row.accountName ?? "—",
      },
      {
        key: "amount",
        header: "Valor",
        align: "right",
        render: (row) => (
          <span className="font-mono font-semibold text-foreground">{formatBRL(row.amount)}</span>
        ),
      },
    ],
    [],
  );

  function runProjection(cdiRate: string) {
    if (!investment.yieldPercentOfBenchmark || Number(investment.currentValue) <= 0) {
      setProjError("Informe posição e % do CDI para projetar.");
      return;
    }
    setProjError(null);
    startProject(async () => {
      const result = await projectYieldAction({
        principal: investment.currentValue,
        yieldPercentOfBenchmark: investment.yieldPercentOfBenchmark,
        cdiAnnualRatePercent: cdiRate,
        days: horizonDays,
      });
      if (!result.success) {
        setProjError(result.error.message);
        return;
      }
      setProjection({
        yieldAmount: result.data.yieldAmount,
        projectedValue: result.data.projectedValue,
        effectiveAnnualRatePercent: result.data.effectiveAnnualRatePercent,
      });
    });
  }

  function handleProject() {
    if (investment.cdiAnnualRatePercent) {
      runProjection(investment.cdiAnnualRatePercent);
      return;
    }
    if (!manualCdi.trim()) {
      setProjError("Informe o CDI a.a. manualmente ou aguarde a cotação.");
      return;
    }
    runProjection(manualCdi.trim());
  }

  function handleSaveManualCdi() {
    if (!manualCdi.trim()) return;
    startSaveCdi(async () => {
      const result = await upsertCdiManualAction({ annualRatePercent: manualCdi.trim() });
      if (!result.success) {
        setProjError(result.error.message);
        return;
      }
      notifySuccess("CDI salvo");
      router.refresh();
    });
  }

  async function handleDelete() {
    const result = await deleteInvestmentAction(investment.id);
    if (!result.success) throw new Error(result.error.message);
    invalidateAllTransactionLists(queryClient);
    notifySuccess("Investimento excluído");
    router.push("/investments");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">{investment.name}</h1>
          <p className="text-sm font-semibold text-muted-foreground">
            {percentLabel} do CDI
            {investment.effectiveAnnualRatePercent
              ? ` · ≈ ${Number(investment.effectiveAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a. (estimativa)`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={() => setContributeOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Aportar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="neutral"
                  size="icon-md"
                  aria-label={`Mais ações para ${investment.name}`}
                />
              }
            >
              <MoreVertical className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" aria-hidden="true" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" aria-hidden="true" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Posição" value={formatBRL(investment.currentValue)} icon={TrendingUp} tone="success" />
        <KPICard title="% do CDI" value={percentLabel} icon={Pencil} tone="neutral" />
        <KPICard
          title="CDI do dia"
          value={
            investment.cdiAnnualRatePercent
              ? `${Number(investment.cdiAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.`
              : "Indisponível"
          }
          icon={TrendingUp}
          tone="neutral"
        />
        <KPICard
          title="Taxa efetiva"
          value={
            investment.effectiveAnnualRatePercent
              ? `≈ ${Number(investment.effectiveAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.`
              : "—"
          }
          icon={TrendingUp}
          tone="success"
        />
      </div>

      <section className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
        <div>
          <h2 className="text-[15px] font-extrabold text-foreground">Projeção estimada</h2>
          <p className="text-[12px] font-semibold text-muted-foreground">
            Juros simples sobre o CDI do dia — não atualiza o patrimônio automaticamente.
          </p>
        </div>

        {!investment.cdiAnnualRatePercent && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <FormField label="CDI a.a. manual (%)" htmlFor="manual-cdi">
                <Input
                  id="manual-cdi"
                  type="number"
                  min={0}
                  step={0.01}
                  value={manualCdi}
                  onChange={(event) => setManualCdi(event.target.value)}
                  placeholder="13.65"
                />
              </FormField>
            </div>
            <Button type="button" variant="neutral" size="sm" onClick={handleSaveManualCdi} disabled={isSavingCdi}>
              {isSavingCdi && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Salvar CDI
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {HORIZONS.map((horizon) => (
            <Button
              key={horizon.days}
              type="button"
              size="sm"
              variant={horizonDays === horizon.days ? "default" : "outline"}
              onClick={() => setHorizonDays(horizon.days)}
            >
              {horizon.label}
            </Button>
          ))}
          <Button type="button" size="sm" onClick={handleProject} disabled={isProjecting}>
            {isProjecting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Calcular
          </Button>
        </div>

        {projError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {projError}
          </p>
        )}

        {projection && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Rendimento estimado</p>
              <p className="font-mono text-base font-extrabold text-success">
                {formatBRL(projection.yieldAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Valor projetado</p>
              <p className="font-mono text-base font-extrabold text-foreground">
                {formatBRL(projection.projectedValue)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Taxa efetiva a.a.</p>
              <p className="font-mono text-base font-extrabold text-foreground">
                ≈ {Number(projection.effectiveAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold text-foreground">Aportes</h2>
        <DataTable
          data={investment.contributions}
          columns={columns}
          getRowId={(row) => row.id}
          emptyState={{
            icon: TrendingUp,
            title: "Nenhum aporte ainda",
          }}
        />
      </section>

      <ContributeModal
        open={contributeOpen}
        onOpenChange={setContributeOpen}
        investmentId={investment.id}
        investmentName={investment.name}
        defaultYieldPercent={investment.yieldPercentOfBenchmark}
        accounts={accounts}
        onSaved={() => {
          invalidateAllTransactionLists(queryClient);
          router.refresh();
        }}
      />

      <InvestmentFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        accounts={accounts}
        investment={{
          id: investment.id,
          name: investment.name,
          yieldPercentOfBenchmark: investment.yieldPercentOfBenchmark,
        }}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir "${investment.name}"?`}
        description="O investimento some do patrimônio. Aportes (transações) continuam no histórico da conta."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </div>
  );
}
