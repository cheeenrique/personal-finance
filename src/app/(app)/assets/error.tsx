"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Error boundary da rota `/assets` — cobre falha inesperada na busca de
 * patrimônio (ex.: banco fora do ar). Estado de erro exigido em toda tela
 * (docs/04-DESIGN_SYSTEM.md, "Feedback"/"EmptyState").
 */
export default function AssetsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[assets] erro ao carregar patrimônio", error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar seu patrimônio"
      description="Tente novamente em instantes."
      actionLabel="Tentar novamente"
      onAction={reset}
    />
  );
}
