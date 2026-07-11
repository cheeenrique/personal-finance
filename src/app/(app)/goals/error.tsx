"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Error boundary da rota `/goals` — cobre falha inesperada na busca de metas,
 * contas ou ativos. Estado de erro exigido em toda tela
 * (docs/04-DESIGN_SYSTEM.md, "Feedback"/"EmptyState"), mesmo padrão de
 * `(app)/budgets/error.tsx`.
 */
export default function GoalsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[goals] erro ao carregar metas", error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar suas metas"
      description="Tente novamente em instantes."
      actionLabel="Tentar novamente"
      onAction={reset}
    />
  );
}
