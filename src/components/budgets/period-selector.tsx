"use client";

import { useRouter, usePathname } from "next/navigation";

import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const MONTH_OPTIONS: EntitySelectOption[] = MONTH_LABELS.map((label, index) => ({
  value: String(index + 1),
  label,
}));

type PeriodSelectorProps = {
  month: number;
  year: number;
};

/**
 * Seletor de Mês/Ano no topo de `/budgets` (docs/26-BUDGETS.md, "Interface":
 * "Seletor Mês/Ano no topo, mês atual por default"). Estado vive na URL
 * (`?month=&year=`), não em `useState` local — abrir o link direto já leva ao
 * mesmo período, e o Server Component (`page.tsx`) é quem lê o default de mês
 * atual quando os params estão ausentes.
 */
export function PeriodSelector({ month, year }: PeriodSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  const yearOptions = Array.from(new Set([year - 2, year - 1, year, year + 1, year + 2])).sort();

  function updatePeriod(nextMonth: number, nextYear: number) {
    const params = new URLSearchParams({ month: String(nextMonth), year: String(nextYear) });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex gap-2">
      <EntitySelect
        options={MONTH_OPTIONS}
        value={String(month)}
        onValueChange={(value) => updatePeriod(Number(value), year)}
        placeholder="Mês"
        aria-label="Mês"
        className="w-[140px]"
      />

      <EntitySelect
        options={yearOptions.map((option) => ({ value: String(option), label: String(option) }))}
        value={String(year)}
        onValueChange={(value) => updatePeriod(month, Number(value))}
        placeholder="Ano"
        aria-label="Ano"
        className="w-[100px]"
      />
    </div>
  );
}
