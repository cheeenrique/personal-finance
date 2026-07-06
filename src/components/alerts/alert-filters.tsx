"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AlertType } from "@/generated/prisma/enums";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

export type TypeFilterValue = AlertType | "all";
export type StatusFilterValue = "all" | "read" | "unread";

const TYPE_OPTIONS: { value: TypeFilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: AlertType.ANOMALY, label: "Atenção" },
  { value: AlertType.GREEN, label: "Verde" },
  { value: AlertType.WEEKLY_SUMMARY, label: "Resumo" },
];

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "unread", label: "Não lido" },
  { value: "read", label: "Lido" },
];

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center rounded-[10px] border px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors duration-100 ease-pf-out",
        active
          ? "border-primary bg-primary/12 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
        FOCUS_RING_CLASS,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Filtros de Tipo e Status de `/alerts` (design/PERSONAL_FINANCE_LAYOUT_HANDOFF.md,
 * "Alertas": pills, não dropdowns), persistidos na URL (`?type=...&status=...`)
 * — mesma convenção de `components/transactions/use-transaction-filters.ts`:
 * shareable, sobrevive a refresh. Sentinela `"all"` representa "Todos" e é
 * removido da URL (fica limpa quando não há filtro ativo). Sem pill "Crítico"
 * — `AlertSeverity` só tem INFO/WARN/GOOD, não há um 4º nível no modelo.
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
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        {TYPE_OPTIONS.map((option) => (
          <FilterPill
            key={option.value}
            active={type === option.value}
            onClick={() => updateParam("type", option.value)}
          >
            {option.label}
          </FilterPill>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status de leitura">
        {STATUS_OPTIONS.map((option) => (
          <FilterPill
            key={option.value}
            active={status === option.value}
            onClick={() => updateParam("status", option.value)}
          >
            {option.label}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}
