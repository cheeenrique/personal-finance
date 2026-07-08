"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Layers3 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { EntitySelect } from "@/components/forms/entity-select";
import type { EntityOption } from "@/components/shared/entity-options-actions";
import { DataTablePagination } from "@/components/tables/data-table-pagination";
import { InstallmentPurchaseCard } from "./installment-purchase-card";
import { NewInstallmentTile } from "./new-installment-tile";
import { InstallmentFormModal } from "./installment-form-modal";
import { InstallmentDetailsModal } from "./installment-details-modal";
import type { InstallmentPurchaseView } from "./types";

const ALL_CARDS_VALUE = "__ALL__";

/** 3 linhas de 3 colunas (grid `lg:grid-cols-3`) por página. */
const PAGE_SIZE = 9;

type InstallmentsBoardProps = {
  purchases: InstallmentPurchaseView[];
  /** `?open=<id>` da URL (docs/23-INSTALLMENTS.md) — abre o modal de
   * detalhes direto nesse item ao carregar, sem exigir clique extra (vem do
   * widget "Parcelamentos ativos" do Dashboard). */
  initialOpenId?: string;
  /** Cartões do usuário — popula o filtro "Cartão" (docs/23-INSTALLMENTS.md, "Filtros"). */
  cardOptions: EntityOption[];
  /** `?cardId=<id>` da URL — cartão selecionado no filtro, já resolvido pelo Server Component. */
  selectedCardId?: string;
  /** `?page=<n>` da URL — página atual, já resolvida pelo Server Component (mesmo padrão de `selectedCardId`). */
  page: number;
};

/**
 * Board de `/installments` (docs/23-INSTALLMENTS.md): grid de cards de
 * compra parcelada — nunca parcelas soltas ("Regra de UX Principal") — +
 * tile "+ Novo parcelamento" + modal de criação + modal de detalhes (lista
 * das N parcelas). `revalidatePath("/installments")` já roda dentro de
 * `createInstallmentPurchaseAction` — o Next atualiza esta árvore
 * automaticamente após criar um parcelamento, sem refetch manual.
 *
 * Paginação client-side (fatia a lista já carregada, `PAGE_SIZE = 9`): a
 * lista de parcelamentos do usuário não cresce sem limite como Transactions
 * (docs/04-DESIGN_SYSTEM.md, "Tabelas" — regra pensada pra listas ilimitadas),
 * então buscar tudo do server e paginar no client evita adicionar
 * page/pageSize no service só por uma paginação visual (YAGNI). Reaproveita
 * o mesmo `DataTablePagination` de `/transactions`/`/accounts`. Página
 * persistida na URL (`?page=`), espelhando o padrão de `?cardId=`: ambos são
 * lidos pelo Server Component e descem como prop, sem estado duplicado no
 * client — trocar de cartão sempre reseta pra página 1.
 */
export function InstallmentsBoard({ purchases, initialOpenId, cardOptions, selectedCardId, page }: InstallmentsBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [formOpen, setFormOpen] = useState(false);
  const [detailsPurchase, setDetailsPurchase] = useState<InstallmentPurchaseView | null>(
    () => purchases.find((purchase) => purchase.id === initialOpenId) ?? null,
  );

  const buildUrl = useCallback(
    (params: { cardId?: string; page?: number }) => {
      const query = new URLSearchParams();
      if (params.cardId) query.set("cardId", params.cardId);
      if (params.page && params.page > 1) query.set("page", String(params.page));
      const queryString = query.toString();
      return queryString ? `${pathname}?${queryString}` : pathname;
    },
    [pathname],
  );

  const handleCardFilterChange = useCallback(
    (value: string) => {
      const nextCardId = value === ALL_CARDS_VALUE ? undefined : value;
      router.replace(buildUrl({ cardId: nextCardId, page: 1 }), { scroll: false });
    },
    [buildUrl, router],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      router.replace(buildUrl({ cardId: selectedCardId, page: nextPage }), { scroll: false });
    },
    [buildUrl, router, selectedCardId],
  );

  const totalPages = Math.max(1, Math.ceil(purchases.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = purchases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hasFilter = Boolean(selectedCardId);

  const filterBar = cardOptions.length > 0 && (
    <EntitySelect
      aria-label="Filtrar por cartão"
      options={[{ value: ALL_CARDS_VALUE, label: "Todos os cartões" }, ...cardOptions.map((card) => ({ value: card.id, label: card.name }))]}
      value={selectedCardId ?? ALL_CARDS_VALUE}
      onValueChange={handleCardFilterChange}
      className="h-[38px] w-auto min-w-[200px]"
    />
  );

  if (purchases.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        <EmptyState
          icon={Layers3}
          title={hasFilter ? "Nenhum parcelamento para esse cartão" : "Nenhum parcelamento ativo"}
          description={
            hasFilter
              ? "Tente selecionar outro cartão ou remova o filtro."
              : "Compras parceladas no cartão aparecem aqui com o progresso das parcelas."
          }
          actionLabel={hasFilter ? "Novo parcelamento" : "Criar primeiro parcelamento"}
          onAction={() => setFormOpen(true)}
        />
        <InstallmentFormModal open={formOpen} onOpenChange={setFormOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filterBar}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageItems.map((purchase) => (
          <InstallmentPurchaseCard
            key={purchase.id}
            purchase={purchase}
            onShowDetails={() => setDetailsPurchase(purchase)}
          />
        ))}
        <NewInstallmentTile onClick={() => setFormOpen(true)} />
      </div>

      {purchases.length > PAGE_SIZE && (
        <div className="rounded-xl border border-border bg-card">
          <DataTablePagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={purchases.length}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      <InstallmentFormModal open={formOpen} onOpenChange={setFormOpen} />

      <InstallmentDetailsModal
        purchase={detailsPurchase}
        onOpenChange={(open) => {
          if (!open) setDetailsPurchase(null);
        }}
      />
    </div>
  );
}
