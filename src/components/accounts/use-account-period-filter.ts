"use client";

import { useMemo, useState } from "react";

import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { periodToRange } from "@/components/transactions/period-presets";

/** Opções do filtro de período do detalhe de conta (docs/21-ACCOUNTS.md, "Filtros") — subconjunto de `PeriodPreset` + "custom" (range livre, sem preset). */
export type AccountPeriodMode = "all" | "this_month" | "last_month" | "custom";

export const ACCOUNT_PERIOD_MODE_OPTIONS: { value: AccountPeriodMode; label: string }[] = [
  { value: "all", label: "Todos os períodos" },
  { value: "this_month", label: "Mês atual" },
  { value: "last_month", label: "Mês passado" },
  { value: "custom", label: "Personalizado" },
];

/**
 * Filtro de período do histórico de transações da conta — reaproveita
 * `periodToRange` (mesmo cálculo de mês atual/passado em America/Sao_Paulo
 * usado em `/transactions`, `period-presets.ts`) pros 2 presets; "Personalizado"
 * usa 2 `DateField` livres (`customFrom`/`customTo`) em vez de um preset.
 * Estado local (não persiste na URL) — escopo menor que `useTransactionFilters`,
 * sem os demais filtros de `/transactions` (docs/06-SCREENS.md, "Contas").
 */
export function useAccountPeriodFilter() {
  // Default "all": importação de OFX traz lançamentos de meses passados — com
  // "Mês atual" eles somem da tabela (mas contam no saldo/gráfico), o que
  // confunde ("importei e não apareceu"). "Todos" mostra tudo (paginado).
  const [mode, setMode] = useState<AccountPeriodMode>("all");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValueSaoPaulo());
  const [customTo, setCustomTo] = useState(() => toDateInputValueSaoPaulo());

  const range = useMemo(() => {
    if (mode === "custom") return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
    return periodToRange(mode);
  }, [mode, customFrom, customTo]);

  return { mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo, range };
}
