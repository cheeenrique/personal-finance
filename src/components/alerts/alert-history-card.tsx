"use client";

import { TriangleAlert, CheckCircle2, Info } from "lucide-react";
import { useTransition } from "react";

import { ReadStatusBadge } from "@/components/shared/badges/alert-severity-badge";
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

export type AlertHistoryItem = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: Date | string;
  readAt: Date | string | null;
};

type AlertHistoryCardProps = {
  alert: AlertHistoryItem;
  onMarkAsRead: (id: string) => Promise<void> | void;
};

/**
 * Linha do histórico completo de `/alerts` (design/PERSONAL_FINANCE_LAYOUT_HANDOFF.md,
 * "Alertas"): ícone tile colorido por severidade à esquerda, título+badge
 * Lido/Novo+descrição ao centro, data por extenso à direita — mesmo tile de
 * `components/shared/alert-card.tsx` (Dashboard), mas em layout de linha
 * única (o histórico tem mais itens que cabem na tela, precisa ser compacto
 * na vertical). Data sempre completa (`formatDateTimeSaoPaulo`, dia/mês/ano/
 * hora) — nunca abreviada em DD/MM. Clique marca como lido.
 */
export function AlertHistoryCard({ alert, onMarkAsRead }: AlertHistoryCardProps) {
  const [isPending, startTransition] = useTransition();
  const isRead = Boolean(alert.readAt);
  const Icon = SEVERITY_ICON[alert.severity];

  function handleClick() {
    if (isRead) return;
    startTransition(() => onMarkAsRead(alert.id));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending || isRead}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-xl border border-border bg-card p-4 text-left transition-colors",
        CARD_SHADOW_CLASS,
        !isRead && "cursor-pointer hover:border-primary/50",
        isRead && "cursor-default",
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

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-extrabold text-foreground">{alert.title}</p>
          <ReadStatusBadge read={isRead} />
        </div>
        <p className="truncate text-[13px] font-medium text-muted-foreground">{alert.message}</p>
      </div>

      <p className="shrink-0 font-mono text-[11px] font-medium whitespace-nowrap text-muted-foreground/80">
        {formatDateTimeSaoPaulo(alert.createdAt)}
      </p>
    </button>
  );
}
