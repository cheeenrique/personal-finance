"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Cache client-side (TanStack Query) pras telas que buscam dados via Server
 * Action diretamente (ex.: `/transactions`, ver `use-transactions-list.ts`).
 * `QueryClient` nasce dentro de `useState` — nunca em module scope — pra não
 * vazar cache entre requests distintos durante SSR (cada render de servidor
 * precisa da sua própria instância).
 *
 * `staleTime` de 1min: dado considerado fresco por 1 minuto ou até uma
 * mutation invalidar a query explicitamente (ver `use-transaction-mutations.ts`),
 * o que vier primeiro — pedido do produto pra parar de refazer fetch a cada
 * troca de filtro repetida.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
