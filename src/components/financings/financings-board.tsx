"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { DataTablePagination } from "@/components/tables/data-table-pagination";
import { FinancingCard, NewFinancingTile } from "./financing-card";
import { FinancingFormModal } from "./financing-form-modal";
import type { FinancingCardView } from "./types";

/** Mesmo tamanho de página de `LoansBoard`/`InstallmentsBoard` — 3 linhas de 3 colunas (`lg:grid-cols-3`). */
const PAGE_SIZE = 9;

type FinancingsBoardProps = { financings: FinancingCardView[] };

/**
 * Board de `/financings`: grid de cards de financiamento + tile "+ Novo
 * financiamento" + modal de criação — espelha `LoansBoard`
 * (`components/loans/loans-board.tsx`). Diferença: `createFinancingAction`
 * chama `revalidateLoanRoutes()` (`modules/loans/action-helpers.ts`), que só
 * cobre `/loans`/`/accounts`/`/dashboard` — não conhece `/financings`
 * (arquivo de módulo, fora do escopo desta tarefa, "NÃO tocar em
 * `src/modules/*`"). Por isso `FinancingFormModal` sempre recebe `onSaved`
 * disparando `router.refresh()` explícito aqui, em vez de confiar só no
 * `revalidatePath` automático que `LoansBoard` usa pra criação.
 *
 * Paginação client-side (mesmo racional de `LoansBoard`): lista de
 * financiamentos do usuário não cresce sem limite, então pagina no client em
 * vez de adicionar page/pageSize no service só por paginação visual (YAGNI).
 */
export function FinancingsBoard({ financings }: FinancingsBoardProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(financings.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = financings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSaved() {
    router.refresh();
  }

  if (financings.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={Landmark}
          title="Nenhum financiamento ativo"
          description="Registre um financiamento para acompanhar as parcelas e o saldo devedor."
          actionLabel="Criar primeiro financiamento"
          onAction={() => setFormOpen(true)}
        />
        <FinancingFormModal open={formOpen} onOpenChange={setFormOpen} onSaved={handleSaved} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageItems.map((financing) => (
          <FinancingCard key={financing.id} financing={financing} />
        ))}
        <NewFinancingTile onClick={() => setFormOpen(true)} />
      </div>

      {financings.length > PAGE_SIZE && (
        <div className="rounded-xl border border-border bg-card">
          <DataTablePagination page={currentPage} pageSize={PAGE_SIZE} total={financings.length} onPageChange={setPage} />
        </div>
      )}

      <FinancingFormModal open={formOpen} onOpenChange={setFormOpen} onSaved={handleSaved} />
    </div>
  );
}
