"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Loader2, MoreVertical, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";

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
import { calendarPartsSP } from "@/lib/date/calendar-sp";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { notifySuccess } from "@/lib/toast";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { ContributeModal } from "./contribute-modal";
import { InvestmentFormModal } from "./investment-form-modal";
import { PositionSparkline } from "./position-sparkline";
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

  // Sparkline = soma acumulada dos aportes (ordenados por data) — aproximação
  // da evolução, já que não há snapshot de saldo por dia. Delta do mês = soma
  // dos aportes cujo mês/ano (America/Sao_Paulo) bate com o mês atual.
  const { sparklinePoints, currentMonthDelta } = useMemo(() => {
    const sorted = [...investment.contributions].sort((a, b) => a.date.localeCompare(b.date));
    const currentParts = calendarPartsSP(nowInSaoPaulo());
    let running = 0;
    let delta = 0;
    const points = sorted.map((contribution) => {
      const amount = Number(contribution.amount);
      running += amount;
      const parts = calendarPartsSP(new Date(contribution.date));
      if (parts.year === currentParts.year && parts.month === currentParts.month) delta += amount;
      return running;
    });
    return { sparklinePoints: points, currentMonthDelta: delta };
  }, [investment.contributions]);

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

  // Projeção do horizonte default (30 dias) já vem calculada ao abrir a tela,
  // quando há CDI do dia disponível — sem exigir clique em "Calcular".
  useEffect(() => {
    if (investment.cdiAnnualRatePercent) runProjection(investment.cdiAnnualRatePercent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-success/16 text-on-success">
            <TrendingUp className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">{investment.name}</h1>
            <p className="text-sm font-semibold text-muted-foreground">
              {percentLabel} do CDI
              {investment.effectiveAnnualRatePercent
                ? ` · ≈ ${Number(investment.effectiveAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a. (estimativa)`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="accent" size="lg" onClick={() => setContributeOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Aportar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="neutral" size="icon-md" aria-label={`Mais ações para ${investment.name}`} />}
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div
          className={cn(
            "flex flex-col justify-between gap-4 rounded-xl border border-border bg-gradient-to-br from-success/[0.14] to-card p-5",
            CARD_SHADOW_CLASS,
          )}
        >
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
              Posição atual
            </p>
            <p className="mt-2 font-mono text-[34px] font-semibold text-foreground">
              {formatBRL(investment.currentValue)}
            </p>
            {currentMonthDelta > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-on-success">
                <ArrowUp className="size-3.5" aria-hidden="true" strokeWidth={2.4} />
                +{formatBRL(currentMonthDelta)} este mês
              </p>
            )}
          </div>
          {sparklinePoints.length >= 2 && (
            <PositionSparkline points={sparklinePoints} className="h-16 w-full" />
          )}
        </div>

        <div className={cn("flex flex-col gap-1 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
          <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">% do CDI</p>
          <p className="mt-1 font-mono text-[30px] font-semibold text-foreground">{percentLabel}</p>
          <p className="text-[13px] font-semibold text-muted-foreground">contratado</p>
        </div>

        <div className={cn("flex flex-col gap-1 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
          <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">CDI do dia</p>
          <p className="mt-1 font-mono text-[30px] font-semibold text-foreground">
            {investment.cdiAnnualRatePercent
              ? `${Number(investment.cdiAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
              : "—"}
          </p>
          <p className="text-[13px] font-semibold text-muted-foreground">
            {investment.cdiAnnualRatePercent ? "a.a. · fonte Gemini" : "indisponível"}
          </p>
        </div>
      </div>

      <section className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-extrabold text-foreground">Projeção estimada</h2>
            <p className="text-[12px] font-semibold text-muted-foreground">
              Juros simples sobre o CDI do dia — não atualiza o patrimônio automaticamente.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full bg-secondary p-1">
              {HORIZONS.map((horizon) => (
                <button
                  key={horizon.days}
                  type="button"
                  onClick={() => setHorizonDays(horizon.days)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors",
                    horizonDays === horizon.days
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {horizon.label}
                </button>
              ))}
            </div>
            <Button type="button" size="sm" onClick={handleProject} disabled={isProjecting}>
              {isProjecting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Calcular
            </Button>
          </div>
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

        {projError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {projError}
          </p>
        )}

        {projection && (
          <div
            key={`${projection.yieldAmount}|${projection.projectedValue}`}
            className="grid grid-cols-1 gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 sm:grid-cols-3"
          >
            <div className="rounded-lg border border-success/30 bg-success/16 p-3">
              <p className="text-xs font-semibold text-muted-foreground">Rendimento estimado</p>
              <p className="mt-1 font-mono text-base font-extrabold text-on-success">
                {formatBRL(projection.yieldAmount)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs font-semibold text-muted-foreground">Valor projetado</p>
              <p className="mt-1 font-mono text-base font-extrabold text-foreground">
                {formatBRL(projection.projectedValue)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs font-semibold text-muted-foreground">Taxa efetiva a.a.</p>
              <p className="mt-1 font-mono text-base font-extrabold text-foreground">
                ≈ {Number(projection.effectiveAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
              </p>
            </div>
          </div>
        )}
      </section>

      <section className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
        <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">Aportes</p>
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
