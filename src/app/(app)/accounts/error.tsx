"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Error boundary da rota `/accounts` — cobre falha inesperada na busca de
 * contas/saldo (ex.: banco fora do ar). Estado de erro exigido em toda tela
 * (docs/04-DESIGN_SYSTEM.md, "Feedback"/"EmptyState").
 */
export default function AccountsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[accounts] erro ao carregar contas", error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar suas contas"
      description="Tente novamente em instantes."
      actionLabel="Tentar novamente"
      onAction={reset}
    />
  );
}
