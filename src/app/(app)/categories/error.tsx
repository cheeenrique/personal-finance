"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Error boundary da rota `/categories` — cobre falha inesperada ao buscar a
 * árvore (ex.: banco fora do ar). Estado de erro exigido em toda tela
 * (docs/04-DESIGN_SYSTEM.md, "Feedback"/"EmptyState").
 */
export default function CategoriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[categories] erro ao carregar categorias", error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar suas categorias"
      description="Tente novamente em instantes."
      actionLabel="Tentar novamente"
      onAction={reset}
    />
  );
}
