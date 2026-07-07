"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EntitySelect } from "@/components/forms/entity-select";
import { PERIOD_OPTIONS, type PeriodPreset } from "@/components/transactions/period-presets";

const DEFAULT_PERIOD: PeriodPreset = "this_month";

type DashboardPeriodSelectProps = {
  period: PeriodPreset;
};

/**
 * Seletor de período do Dashboard — mesmo dropdown de `/reports`
 * (`PERIOD_OPTIONS`), só que URL-driven de um único parâmetro (`?period=`),
 * sem os outros filtros globais de `useReportFilters` (categoria/conta/
 * cartão/tipo não fazem sentido aqui, ver task do filtro de período). Default
 * "this_month" nunca aparece na URL — mantém o link igual ao comportamento
 * de hoje quando nenhum filtro foi tocado.
 */
export function DashboardPeriodSelect({ period }: DashboardPeriodSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_PERIOD) params.delete("period");
    else params.set("period", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <EntitySelect
      options={PERIOD_OPTIONS}
      value={period}
      onValueChange={handleChange}
      className="h-[38px] w-auto min-w-[160px]"
    />
  );
}
