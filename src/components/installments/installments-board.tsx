"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Layers3 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { EntitySelect } from "@/components/forms/entity-select";
import type { EntityOption } from "@/components/shared/entity-options-actions";
import { InstallmentPurchaseCard } from "./installment-purchase-card";
import { NewInstallmentTile } from "./new-installment-tile";
import { InstallmentFormModal } from "./installment-form-modal";
import { InstallmentDetailsModal } from "./installment-details-modal";
import type { InstallmentPurchaseView } from "./types";

const ALL_CARDS_VALUE = "__ALL__";

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
};

/**
 * Board de `/installments` (docs/23-INSTALLMENTS.md): grid de cards de
 * compra parcelada — nunca parcelas soltas ("Regra de UX Principal") — +
 * tile "+ Novo parcelamento" + modal de criação + modal de detalhes (lista
 * das N parcelas). Sem paginação, lista completa (docs/04-DESIGN_SYSTEM.md,
 * "Paginação apenas em Transactions"). `revalidatePath("/installments")` já
 * roda dentro de `createInstallmentPurchaseAction` — o Next atualiza esta
 * árvore automaticamente após criar um parcelamento, sem refetch manual.
 * Filtro por cartão persistido na URL (`?cardId=`, mesmo padrão de
 * `/transactions`) — o Server Component já refaz a query filtrada no
 * servidor a cada navegação.
 */
export function InstallmentsBoard({ purchases, initialOpenId, cardOptions, selectedCardId }: InstallmentsBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [formOpen, setFormOpen] = useState(false);
  const [detailsPurchase, setDetailsPurchase] = useState<InstallmentPurchaseView | null>(
    () => purchases.find((purchase) => purchase.id === initialOpenId) ?? null,
  );

  const handleCardFilterChange = useCallback(
    (value: string) => {
      router.replace(value === ALL_CARDS_VALUE ? pathname : `${pathname}?cardId=${value}`, { scroll: false });
    },
    [pathname, router],
  );

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {purchases.map((purchase) => (
          <InstallmentPurchaseCard
            key={purchase.id}
            purchase={purchase}
            onShowDetails={() => setDetailsPurchase(purchase)}
          />
        ))}
        <NewInstallmentTile onClick={() => setFormOpen(true)} />
      </div>

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
