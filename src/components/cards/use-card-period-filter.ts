"use client";

import { useMemo, useState } from "react";

import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { periodToRange, type PeriodPreset } from "@/components/transactions/period-presets";

export type CardPeriodMode = Extract<PeriodPreset, "this_month" | "last_month" | "custom">;

/** Só os 3 modos que a spec desta tela pede (Personal Finance - Cartoes.dc.html, "compras da fatura atual") — sem "todos"/"3 meses"/"últimos 30 dias" do preset completo de `/transactions`. */
export const CARD_PERIOD_MODE_OPTIONS: { value: CardPeriodMode; label: string }[] = [
  { value: "this_month", label: "Mês atual" },
  { value: "last_month", label: "Mês passado" },
  { value: "custom", label: "Personalizado" },
];

/**
 * Filtro de período segmentado reaproveitado nas compras da fatura atual
 * (CREDIT, `card-detail-view.tsx`) e nas movimentações (MEAL,
 * `card-detail-view-meal.tsx`) — mesmo padrão comportamental de
 * `useAccountPeriodFilter` (`/accounts/[id]`), reduzido aos 3 modos do
 * segmented control pedido aqui. Reaproveita `periodToRange`
 * (`components/transactions/period-presets.ts`) pros 2 modos calculados;
 * "custom" usa as 2 datas livres escolhidas pelo usuário. Estado local (não
 * persiste na URL), default "Mês atual" — mesmo motivo de
 * `useAccountPeriodFilter`: a tela abre já filtrada no mês corrente.
 */
export function useCardPeriodFilter() {
  const [mode, setMode] = useState<CardPeriodMode>("this_month");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValueSaoPaulo());
  const [customTo, setCustomTo] = useState(() => toDateInputValueSaoPaulo());

  const range = useMemo(() => {
    if (mode === "custom") return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
    return periodToRange(mode);
  }, [mode, customFrom, customTo]);

  return { mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo, range };
}
