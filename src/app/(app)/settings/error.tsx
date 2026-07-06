"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Error boundary da rota `/settings` (docs/12-SETTINGS.md, "Estados" >
 * "Erro"). Estado de erro exigido em toda tela (docs/04-DESIGN_SYSTEM.md,
 * "Feedback"/"EmptyState").
 */
export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settings] erro ao carregar configurações", error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar suas configurações"
      description="Tente novamente em instantes."
      actionLabel="Tentar novamente"
      onAction={reset}
    />
  );
}
