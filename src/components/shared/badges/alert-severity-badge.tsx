import { TriangleAlert, CheckCircle2, Info } from "lucide-react";

import { AlertSeverity } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { label: string; icon: typeof Info; className: string }
> = {
  /* Texto sobre tint usa `on-*` (mesma regra do AlertCard/KPICard): a cor-base
   * não passa AA em nenhum dos temas sobre o próprio tint /16. */
  [AlertSeverity.INFO]: {
    label: "Resumo",
    icon: Info,
    className: "bg-primary/16 text-on-primary",
  },
  [AlertSeverity.WARN]: {
    label: "Atenção",
    icon: TriangleAlert,
    className: "bg-warning/16 text-on-warning",
  },
  [AlertSeverity.GOOD]: {
    label: "No verde",
    icon: CheckCircle2,
    className: "bg-success/16 text-on-success",
  },
};

/** Badge de severidade de alerta — GOOD/WARN/INFO (docs/06-SCREENS.md, "AlertCard"). */
export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
        config.className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {config.label}
    </span>
  );
}

/** Badge de leitura de alerta — "Lido"/"Novo" (docs/06-SCREENS.md, "Badge de status"). */
export function ReadStatusBadge({ read }: { read: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
        read
          ? "bg-secondary text-muted-foreground"
          : // `on-danger`, não `destructive` — é o que o layout handoff pede pro
            // "Novo" e o que passa AA sobre o tint /15 nos dois temas.
            "bg-destructive/15 text-on-danger",
      )}
    >
      {read ? "Lido" : "Novo"}
    </span>
  );
}
