"use client";

import { useState } from "react";

import { AlertCard, type AlertCardData } from "@/components/shared/alert-card";
import { markReadAction } from "@/modules/alerts/actions";

const MAX_VISIBLE_ALERTS = 6;

type AlertsSectionProps = {
  alerts: AlertCardData[];
};

/**
 * Lista de Alertas Ativos do Dashboard (docs/11-DASHBOARD.md, "Lista de
 * Alertas Ativos"): só ANOMALY/GREEN — WEEKLY_SUMMARY já tem seu próprio box
 * dedicado acima, mostrar os dois seria duplicar a mesma informação
 * (docs/29-ALERTS.md, "Interface no Dashboard" lista só anomalia/verde
 * aqui). Grid lado a lado (não full-width), até
 * `MAX_VISIBLE_ALERTS` — visão completa continua em `/alerts`
 * (design/Personal Finance App.dc.html, "alertas ativos"). Sem empty state
 * aqui: nenhum alerta novo é o caso comum, não uma ausência a comunicar.
 * Clique marca como lido — remoção otimista da lista local, já que
 * `markReadAction` também revalida a rota (`revalidatePath`) por trás.
 */
export function AlertsSection({ alerts }: AlertsSectionProps) {
  const [activeAlerts, setActiveAlerts] = useState(alerts);

  async function handleMarkAsRead(id: string) {
    setActiveAlerts((current) => current.filter((alert) => alert.id !== id));
    await markReadAction(id);
  }

  if (activeAlerts.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {activeAlerts.slice(0, MAX_VISIBLE_ALERTS).map((alert) => (
        <AlertCard key={alert.id} alert={alert} onMarkAsRead={handleMarkAsRead} />
      ))}
    </div>
  );
}
