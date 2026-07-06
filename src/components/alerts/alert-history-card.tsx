"use client";

import { useTransition } from "react";

import {
  AlertSeverityBadge,
  ReadStatusBadge,
} from "@/components/shared/badges/alert-severity-badge";
import type { AlertSeverity } from "@/generated/prisma/enums";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { formatDateTimeSaoPaulo } from "@/lib/date/format";

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
 * Variação do `AlertCard` (`components/shared/alert-card.tsx`) para o
 * histórico completo de `/alerts` (docs/06-SCREENS.md, "Alertas": "⚠ Anomalia
 * — Alimentação 83% acima do normal  [Lido]"). Em vez do ícone tile usado no
 * Dashboard, mostra `AlertSeverityBadge` (tipo) + `ReadStatusBadge` (Lido/Novo)
 * sempre visível — o histórico precisa distinguir os 3 tipos e os 2 estados
 * de leitura lado a lado, já que a lista inclui alertas já lidos. Clique
 * marca como lido, mesmo comportamento do `AlertCard`.
 */
export function AlertHistoryCard({ alert, onMarkAsRead }: AlertHistoryCardProps) {
  const [isPending, startTransition] = useTransition();
  const isRead = Boolean(alert.readAt);

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
        "flex w-full flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-left transition-colors",
        CARD_SHADOW_CLASS,
        !isRead && "cursor-pointer hover:border-primary/50",
        isRead && "cursor-default",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <AlertSeverityBadge severity={alert.severity} />
          <p className="truncate text-sm font-extrabold text-foreground">{alert.title}</p>
        </div>
        <ReadStatusBadge read={isRead} />
      </div>

      <p className="text-[13px] font-medium text-muted-foreground">{alert.message}</p>

      <p className="font-mono text-[11px] font-medium text-muted-foreground/80">
        {formatDateTimeSaoPaulo(alert.createdAt)}
      </p>
    </button>
  );
}
