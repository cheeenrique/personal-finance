"use client";

import {
  deleteTransactionAction,
  undoDeleteTransactionAction,
  updateTransactionAction,
} from "@/modules/transactions/actions";
import type { ClientTransaction } from "@/modules/transactions/types";
import { notifyError, notifySuccess } from "@/lib/toast";

/** Pernas de TRANSFER nunca são editadas/excluídas por aqui — `accounts/transfer.ts` não implementa propagação pro par ainda. */
export function isTransferLeg(row: ClientTransaction): boolean {
  return Boolean(row.transferId);
}

/**
 * Mutations da tabela de Transações (excluir com undo, ações em massa) —
 * extraído de `transactions-view.tsx` por tamanho de arquivo (rule
 * 05-naming-size). Toda mutation termina revalidando a listagem via
 * `onMutated` (o `revalidatePath` do server action não recarrega dados
 * buscados client-side, ver `transactions-view.tsx`).
 */
export function useTransactionMutations(onMutated: () => void) {
  async function deleteOne(row: ClientTransaction): Promise<void> {
    const result = await deleteTransactionAction(row.id);
    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    notifySuccess("Transação excluída", {
      action: { label: "Desfazer", onClick: () => void undoDelete(row.id) },
    });
    onMutated();
  }

  async function undoDelete(id: string): Promise<void> {
    const result = await undoDeleteTransactionAction(id);
    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    notifySuccess("Transação restaurada");
    onMutated();
  }

  async function bulkDelete(rows: ClientTransaction[]): Promise<void> {
    const deletable = rows.filter((row) => !isTransferLeg(row));
    const skipped = rows.length - deletable.length;

    await Promise.all(deletable.map((row) => deleteTransactionAction(row.id)));

    notifySuccess(
      `${deletable.length} transação(ões) excluída(s)${skipped ? ` — ${skipped} de transferência ignorada(s)` : ""}`,
    );
    onMutated();
  }

  async function bulkMarkPaid(rows: ClientTransaction[]): Promise<void> {
    const updatable = rows.filter((row) => !isTransferLeg(row) && !row.isPaid);

    await Promise.all(updatable.map((row) => updateTransactionAction(row.id, { isPaid: true })));

    notifySuccess(`${updatable.length} transação(ões) marcada(s) como paga(s)`);
    onMutated();
  }

  return { deleteOne, bulkDelete, bulkMarkPaid };
}
