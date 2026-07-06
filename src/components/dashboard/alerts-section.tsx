"use client";

import { useState } from "react";
import { BellOff } from "lucide-react";

import { AlertCard, type AlertCardData } from "@/components/shared/alert-card";
import { EmptyState } from "@/components/shared/empty-state";
import { markReadAction } from "@/modules/alerts/actions";

type AlertsSectionProps = {
  alerts: AlertCardData[];
};

/**
 * Lista de Alertas Ativos do Dashboard (docs/11-DASHBOARD.md, "Lista de
 * Alertas Ativos"): só ANOMALY/GREEN — WEEKLY_SUMMARY já tem seu próprio box
 * dedicado acima, mostrar os dois seria duplicar a mesma informação
 * (docs/29-ALERTS.md, "Interface no Dashboard" lista só anomalia/verde
 * aqui). Clique marca como lido — remoção otimista da lista local, já que
 * `markReadAction` também revalida a rota (`revalidatePath`) por trás.
 */
export function AlertsSection({ alerts }: AlertsSectionProps) {
  const [activeAlerts, setActiveAlerts] = useState(alerts);

  async function handleMarkAsRead(id: string) {
    setActiveAlerts((current) => current.filter((alert) => alert.id !== id));
    await markReadAction(id);
  }

  if (activeAlerts.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="Nenhum alerta novo esta semana"
        description="Continue assim! Alertas de anomalia e economia aparecem aqui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {activeAlerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} onMarkAsRead={handleMarkAsRead} />
      ))}
    </div>
  );
}
