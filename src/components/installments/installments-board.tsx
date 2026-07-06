"use client";

import { useState } from "react";
import { Layers3 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { InstallmentPurchaseCard } from "./installment-purchase-card";
import { NewInstallmentTile } from "./new-installment-tile";
import { InstallmentFormModal } from "./installment-form-modal";
import { InstallmentDetailsModal } from "./installment-details-modal";
import type { InstallmentPurchaseView } from "./types";

type InstallmentsBoardProps = {
  purchases: InstallmentPurchaseView[];
  /** `?open=<id>` da URL (docs/23-INSTALLMENTS.md) — abre o modal de
   * detalhes direto nesse item ao carregar, sem exigir clique extra (vem do
   * widget "Parcelamentos ativos" do Dashboard). */
  initialOpenId?: string;
};

/**
 * Board de `/installments` (docs/23-INSTALLMENTS.md): grid de cards de
 * compra parcelada — nunca parcelas soltas ("Regra de UX Principal") — +
 * tile "+ Novo parcelamento" + modal de criação + modal de detalhes (lista
 * das N parcelas). Sem paginação, lista completa (docs/04-DESIGN_SYSTEM.md,
 * "Paginação apenas em Transactions"). `revalidatePath("/installments")` já
 * roda dentro de `createInstallmentPurchaseAction` — o Next atualiza esta
 * árvore automaticamente após criar um parcelamento, sem refetch manual.
 */
export function InstallmentsBoard({ purchases, initialOpenId }: InstallmentsBoardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [detailsPurchase, setDetailsPurchase] = useState<InstallmentPurchaseView | null>(
    () => purchases.find((purchase) => purchase.id === initialOpenId) ?? null,
  );

  if (purchases.length === 0) {
    return (
      <>
        <EmptyState
          icon={Layers3}
          title="Nenhum parcelamento ativo"
          description="Compras parceladas no cartão aparecem aqui com o progresso das parcelas."
          actionLabel="Criar primeiro parcelamento"
          onAction={() => setFormOpen(true)}
        />
        <InstallmentFormModal open={formOpen} onOpenChange={setFormOpen} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
