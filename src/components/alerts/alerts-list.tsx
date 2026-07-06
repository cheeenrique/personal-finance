"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { markReadAction } from "@/modules/alerts/actions";
import { AlertHistoryCard, type AlertHistoryItem } from "./alert-history-card";
import type { StatusFilterValue } from "./alert-filters";

type AlertsListProps = {
  alerts: AlertHistoryItem[];
  statusFilter: StatusFilterValue;
  emptyTitle: string;
};

/**
 * Lista do histórico completo de `/alerts` (docs/06-SCREENS.md, "Alertas").
 * Diferente do `AlertsSection` do Dashboard, marcar como lido aqui NÃO
 * remove o card da lista — só troca o badge Novo→Lido no lugar — EXCETO
 * quando o filtro de status atual é "Não lido": nesse caso o item some,
 * porque deixou de bater o filtro selecionado (mesma regra de "otimista"
 * pedida na tarefa). `markReadAction` também revalida `/alerts` por trás.
 */
export function AlertsList({ alerts, statusFilter, emptyTitle }: AlertsListProps) {
  const [items, setItems] = useState(alerts);

  async function handleMarkAsRead(id: string) {
    setItems((current) =>
      statusFilter === "unread"
        ? current.filter((item) => item.id !== id)
        : current.map((item) => (item.id === id ? { ...item, readAt: new Date() } : item)),
    );
    await markReadAction(id);
  }

  if (items.length === 0) {
    return <EmptyState icon={Inbox} title={emptyTitle} />;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((alert) => (
        <AlertHistoryCard key={alert.id} alert={alert} onMarkAsRead={handleMarkAsRead} />
      ))}
    </div>
  );
}
