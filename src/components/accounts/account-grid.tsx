"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteAccountAction } from "@/modules/accounts/actions";
import { notifySuccess } from "@/lib/toast";
import { AccountCard, NewAccountTile } from "./account-card";
import { AccountFormModal } from "./account-form-modal";
import { TransferModal } from "./transfer-modal";
import type { AccountCardData } from "./types";

type AccountGridProps = {
  accounts: AccountCardData[];
};

/**
 * Board de contas: grid de cards + tile "+ Nova Conta" + modais de
 * criar/editar/excluir/transferir. `revalidatePath("/accounts")` já roda
 * dentro de cada Server Action (modules/accounts/actions.ts) — o Next
 * atualiza os dados desta árvore automaticamente após cada ação, sem
 * necessidade de refetch manual no client.
 */
export function AccountGrid({ accounts }: AccountGridProps) {
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountCardData | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<AccountCardData | null>(null);
  const [isTransferOpen, setTransferOpen] = useState(false);

  function openCreate() {
    setEditingAccount(null);
    setFormOpen(true);
  }

  function openEdit(account: AccountCardData) {
    setEditingAccount(account);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingAccount) return;
    const result = await deleteAccountAction(deletingAccount.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Conta excluída");
  }

  if (accounts.length === 0) {
    return (
      <>
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta ainda"
          description="Cadastre sua primeira conta para começar a acompanhar seu saldo real."
          actionLabel="+ Nova Conta"
          onAction={openCreate}
        />
        <AccountFormModal open={isFormOpen} onOpenChange={setFormOpen} account={editingAccount} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {accounts.length >= 2 && (
          <Button type="button" variant="outline" onClick={() => setTransferOpen(true)}>
            Transferir
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onEdit={() => openEdit(account)}
            onDelete={() => setDeletingAccount(account)}
          />
        ))}
        <NewAccountTile onClick={openCreate} />
      </div>

      <AccountFormModal open={isFormOpen} onOpenChange={setFormOpen} account={editingAccount} />

      <TransferModal open={isTransferOpen} onOpenChange={setTransferOpen} accounts={accounts} />

      <ConfirmDialog
        open={deletingAccount !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingAccount(null);
        }}
        title={`Excluir "${deletingAccount?.name ?? ""}"`}
        description="A conta será removida da listagem. Transações já lançadas continuam existindo para histórico."
        onConfirm={handleDelete}
      />
    </div>
  );
}
