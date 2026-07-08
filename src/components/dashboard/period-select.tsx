"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DateField } from "@/components/forms/date-field";
import { EntitySelect } from "@/components/forms/entity-select";
import { Label } from "@/components/ui/label";
import { PERIOD_OPTIONS, type PeriodPreset } from "@/components/transactions/period-presets";

const DEFAULT_PERIOD: PeriodPreset = "this_month";

type DashboardPeriodSelectProps = {
  period: PeriodPreset;
  /** Só usados quando `period === "custom"` (docs/50-AUDITORIA-BACKLOG.md F12). */
  customFrom?: string;
  customTo?: string;
};

/**
 * Seletor de período do Dashboard — mesmo dropdown de `/reports`
 * (`PERIOD_OPTIONS`), só que URL-driven de um único parâmetro (`?period=`,
 * mais `?dateFrom=&dateTo=` quando "Personalizado"), sem os outros filtros
 * globais de `useReportFilters` (categoria/conta/cartão/tipo não fazem
 * sentido aqui, ver task do filtro de período). Default "this_month" nunca
 * aparece na URL — mantém o link igual ao comportamento de hoje quando
 * nenhum filtro foi tocado.
 */
export function DashboardPeriodSelect({ period, customFrom, customTo }: DashboardPeriodSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(next: { period?: string; dateFrom?: string; dateTo?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const merged = {
      period: next.period ?? period,
      dateFrom: next.dateFrom ?? customFrom,
      dateTo: next.dateTo ?? customTo,
    };

    if (merged.period === DEFAULT_PERIOD) params.delete("period");
    else params.set("period", merged.period);

    if (merged.period === "custom" && merged.dateFrom) params.set("dateFrom", merged.dateFrom);
    else params.delete("dateFrom");

    if (merged.period === "custom" && merged.dateTo) params.set("dateTo", merged.dateTo);
    else params.delete("dateTo");

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <EntitySelect
        options={PERIOD_OPTIONS}
        value={period}
        onValueChange={(value) => updateParams({ period: value })}
        className="h-[38px] w-auto min-w-[160px]"
      />

      {period === "custom" && (
        <>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="dashboard-period-from" className="text-[12.5px] text-muted-foreground">
              De
            </Label>
            <DateField
              id="dashboard-period-from"
              value={customFrom ?? ""}
              onValueChange={(value) => updateParams({ dateFrom: value })}
              className="h-[38px] w-[150px]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="dashboard-period-to" className="text-[12.5px] text-muted-foreground">
              Até
            </Label>
            <DateField
              id="dashboard-period-to"
              value={customTo ?? ""}
              onValueChange={(value) => updateParams({ dateTo: value })}
              className="h-[38px] w-[150px]"
            />
          </div>
        </>
      )}
    </div>
  );
}
