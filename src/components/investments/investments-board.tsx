"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { DataTablePagination } from "@/components/tables/data-table-pagination";
import { InvestmentCard, NewInvestmentTile } from "./investment-card";
import { InvestmentFormModal } from "./investment-form-modal";
import type { AccountOptionView, InvestmentCardView } from "./types";

const PAGE_SIZE = 9;

type InvestmentsBoardProps = {
  investments: InvestmentCardView[];
  accounts: AccountOptionView[];
};

/**
 * Board de `/investments` — espelha `FinancingsBoard`: grid + tile novo +
 * modal de criação + paginação client-side.
 */
export function InvestmentsBoard({ investments, accounts }: InvestmentsBoardProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(investments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = investments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSaved() {
    router.refresh();
  }

  if (investments.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={TrendingUp}
          title="Nenhum investimento"
          description="Crie um CDB, cofrinho ou outro produto e aporte a partir do saldo da conta."
          actionLabel="Criar primeiro investimento"
          onAction={() => setFormOpen(true)}
        />
        <InvestmentFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          accounts={accounts}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageItems.map((investment) => (
          <InvestmentCard key={investment.id} investment={investment} />
        ))}
        <NewInvestmentTile onClick={() => setFormOpen(true)} />
      </div>

      {investments.length > PAGE_SIZE && (
        <div className="rounded-xl border border-border bg-card">
          <DataTablePagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={investments.length}
            onPageChange={setPage}
          />
        </div>
      )}

      <InvestmentFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        accounts={accounts}
        onSaved={handleSaved}
      />
    </div>
  );
}
