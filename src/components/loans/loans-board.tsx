"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { DataTablePagination } from "@/components/tables/data-table-pagination";
import { LoanCard, NewLoanTile } from "./loan-card";
import { LoanFormModal } from "./loan-form-modal";
import type { LoanCardView } from "./types";

/** 3 linhas de 3 colunas (grid `lg:grid-cols-3`) por página — mesmo tamanho de `InstallmentsBoard`. */
const PAGE_SIZE = 9;

type LoansBoardProps = { loans: LoanCardView[] };

/**
 * Board de `/loans`: grid de cards de empréstimo + tile "+ Novo empréstimo" +
 * modal de criação. `revalidatePath("/loans")` já roda dentro de
 * `createLoanAction` — o Next atualiza esta árvore automaticamente após criar
 * um empréstimo, sem refetch manual.
 *
 * Paginação client-side (fatia a lista já carregada, mesmo racional de
 * `InstallmentsBoard`): a lista de empréstimos do usuário não cresce sem
 * limite como Transactions (docs/04-DESIGN_SYSTEM.md, "Tabelas"), então
 * buscar tudo do server e paginar no client evita adicionar page/pageSize no
 * service só por paginação visual (YAGNI). Sem persistência na URL (`?page=`)
 * — diferente de Parcelamentos, `/loans` tem rota de detalhe própria
 * (`/loans/[id]`) em vez de um `?open=` deep-link pro modal, então não há
 * necessidade de preservar a página atual entre navegações.
 */
export function LoansBoard({ loans }: LoansBoardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(loans.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = loans.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loans.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={HandCoins}
          title="Nenhum empréstimo ativo"
          description="Registre um empréstimo para acompanhar as parcelas e o saldo devedor."
          actionLabel="Criar primeiro empréstimo"
          onAction={() => setFormOpen(true)}
        />
        <LoanFormModal open={formOpen} onOpenChange={setFormOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {pageItems.map((loan) => (
          <LoanCard key={loan.id} loan={loan} />
        ))}
        <NewLoanTile onClick={() => setFormOpen(true)} />
      </div>

      {loans.length > PAGE_SIZE && (
        <div className="rounded-xl border border-border bg-card">
          <DataTablePagination page={currentPage} pageSize={PAGE_SIZE} total={loans.length} onPageChange={setPage} />
        </div>
      )}

      <LoanFormModal open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
