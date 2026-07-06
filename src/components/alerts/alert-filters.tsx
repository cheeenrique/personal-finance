"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EntitySelect } from "@/components/forms/entity-select";
import { AlertType } from "@/generated/prisma/enums";

export type TypeFilterValue = AlertType | "all";
export type StatusFilterValue = "all" | "read" | "unread";

const TYPE_OPTIONS: { value: TypeFilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: AlertType.ANOMALY, label: "Atenção (anomalia)" },
  { value: AlertType.GREEN, label: "Verde" },
  { value: AlertType.WEEKLY_SUMMARY, label: "Resumo" },
];

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "unread", label: "Não lido" },
  { value: "read", label: "Lido" },
];

/**
 * Filtros de Tipo e Status de `/alerts` (docs/06-SCREENS.md, "Alertas":
 * "[Tipo: Todos/Resumo/Anomalia/Verde▾] [Lido: Todos▾]"), persistidos na URL
 * (`?type=...&status=...`) — mesma convenção de
 * `components/transactions/use-transaction-filters.ts`: shareable, sobrevive
 * a refresh. Sentinela `"all"` representa "Todos" e é removido da URL (fica
 * limpa quando não há filtro ativo).
 */
export function AlertFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const type = (searchParams.get("type") as TypeFilterValue) || "all";
  const status = (searchParams.get("status") as StatusFilterValue) || "all";

  function updateParam(key: "type" | "status", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      <EntitySelect
        options={TYPE_OPTIONS}
        value={type}
        onValueChange={(value) => updateParam("type", value)}
        placeholder="Tipo"
        aria-label="Filtrar por tipo"
        className="w-full sm:w-52"
      />

      <EntitySelect
        options={STATUS_OPTIONS}
        value={status}
        onValueChange={(value) => updateParam("status", value)}
        placeholder="Status"
        aria-label="Filtrar por status de leitura"
        className="w-full sm:w-40"
      />
    </div>
  );
}
