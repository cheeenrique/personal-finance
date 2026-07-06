"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Error boundary da rota `/tags` — cobre falha inesperada na busca de tags.
 * Estado de erro exigido em toda tela (docs/04-DESIGN_SYSTEM.md, "Feedback"/
 * "EmptyState").
 */
export default function TagsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[tags] erro ao carregar tags", error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar suas tags"
      description="Tente novamente em instantes."
      actionLabel="Tentar novamente"
      onAction={reset}
    />
  );
}
