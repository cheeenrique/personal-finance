"use client";

import { TriangleAlert, CheckCircle2, Info } from "lucide-react";
import { useTransition } from "react";

import { AlertSeverity } from "@/generated/prisma/enums";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { formatDateTimeSaoPaulo } from "@/lib/date/format";

const SEVERITY_ICON: Record<AlertSeverity, typeof Info> = {
  [AlertSeverity.INFO]: Info,
  [AlertSeverity.WARN]: TriangleAlert,
  [AlertSeverity.GOOD]: CheckCircle2,
};

const SEVERITY_TINT: Record<AlertSeverity, string> = {
  [AlertSeverity.INFO]: "bg-primary/16 text-primary",
  [AlertSeverity.WARN]: "bg-warning/16 text-warning",
  [AlertSeverity.GOOD]: "bg-success/16 text-success",
};

export type AlertCardData = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: Date | string;
  readAt: Date | string | null;
};

type AlertCardProps = {
  alert: AlertCardData;
  onMarkAsRead?: (id: string) => Promise<void> | void;
};

/**
 * Renderiza os 3 tipos de alerta (WEEKLY_SUMMARY/ANOMALY/GREEN, mapeados por
 * `severity`). Clique marca como lido — remove do destaque, nunca apaga
 * (docs/06-SCREENS.md, "AlertCard").
 */
export function AlertCard({ alert, onMarkAsRead }: AlertCardProps) {
  const [isPending, startTransition] = useTransition();
  const Icon = SEVERITY_ICON[alert.severity];
  const isRead = Boolean(alert.readAt);

  function handleClick() {
    if (isRead || !onMarkAsRead) return;
    startTransition(() => onMarkAsRead(alert.id));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending || isRead || !onMarkAsRead}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors",
        CARD_SHADOW_CLASS,
        !isRead && onMarkAsRead && "cursor-pointer hover:border-primary/50",
        (isRead || !onMarkAsRead) && "cursor-default",
      )}
    >
      <span
        className={cn(
          "flex size-[38px] shrink-0 items-center justify-center rounded-[11px]",
          SEVERITY_TINT[alert.severity],
        )}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-foreground">{alert.title}</p>
          {isRead && (
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              Lido
            </span>
          )}
        </div>
        <p className="text-[13px] font-medium text-muted-foreground">{alert.message}</p>
        <p className="font-mono text-[11px] font-medium text-muted-foreground/80">
          {formatDateTimeSaoPaulo(alert.createdAt)}
        </p>
      </div>
    </button>
  );
}
