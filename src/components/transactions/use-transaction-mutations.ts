"use client";

import { useQueryClient } from "@tanstack/react-query";

import {
  deleteTransactionAction,
  undoDeleteTransactionAction,
  updateTransactionAction,
} from "@/modules/transactions/actions";
import type { ClientTransaction } from "@/modules/transactions/types";
import { notifyError, notifySuccess } from "@/lib/toast";
import { invalidateAllTransactionLists } from "./transaction-query-keys";

/**
 * Perna de TRANSFER: EDITAR segue bloqueado (`accounts/transfer.ts` não
 * propaga edição pro par ainda), mas EXCLUIR é permitido — o backend
 * (`transactionService.deleteTransaction`) soft-deleta as 2 pernas juntas
 * pelo `transferId`, revertendo o saldo das 2 contas de uma vez.
 */
export function isTransferLeg(row: { transferId: string | null }): boolean {
  return Boolean(row.transferId);
}

/**
 * `cardId` preenchido = transação vinculada a cartão de crédito (compra,
 * parcela ou pagamento de fatura) — o controle de "marcar como paga" por
 * linha (botão + switch de `EditTransactionModal`) só existe pra transação
 * de CONTA. Cobrança de cartão é confirmada na hora da compra; o pagamento
 * real acontece no nível da FATURA (`payInvoiceAction`), não por transação
 * individual — decisão confirmada pelo dono do produto.
 */
export function isCardTransaction(row: { cardId: string | null }): boolean {
  return Boolean(row.cardId);
}

/**
 * Mutations da tabela de Transações (excluir com undo, ações em massa) —
 * extraído de `transactions-view.tsx` por tamanho de arquivo (rule
 * 05-naming-size). Toda mutation termina revalidando a listagem via
 * `onMutated` (o `revalidatePath` do server action não recarrega dados
 * buscados client-side, ver `transactions-view.tsx`).
 *
 * `deleteOne`/`isTransferLeg` aceitam só o subconjunto de campos que usam
 * (`id`/`transferId`, não `ClientTransaction` inteiro) — permite reaproveitar
 * este hook em listas derivadas que não carreguem o shape completo, sem
 * duplicar a lógica de excluir+undo.
 *
 * Reaproveitado em telas diferentes (`/transactions`, `/accounts/[id]`,
 * detalhe de cartão) de onde a MESMA transação pode também listar — por isso
 * toda mutation aqui invalida TODAS as listagens client-side
 * (`transaction-query-keys.ts`), além de `onMutated()` (que cobre a tela
 * atual e, em alguns casos, o `router.refresh()` dos RSC).
 */
export function useTransactionMutations(onMutated: () => void) {
  const queryClient = useQueryClient();

  async function deleteOne(row: { id: string; transferId?: string | null }): Promise<void> {
    const isTransfer = Boolean(row.transferId);

    const result = await deleteTransactionAction(row.id);
    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    invalidateAllTransactionLists(queryClient);
    notifySuccess(isTransfer ? "Transferência excluída (as 2 pernas)" : "Transação excluída", {
      action: { label: "Desfazer", onClick: () => void undoDelete(row.id, isTransfer) },
    });
    onMutated();
  }

  async function undoDelete(id: string, isTransfer = false): Promise<void> {
    const result = await undoDeleteTransactionAction(id);
    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    invalidateAllTransactionLists(queryClient);
    notifySuccess(isTransfer ? "Transferência restaurada (as 2 pernas)" : "Transação restaurada");
    onMutated();
  }

  async function bulkDelete(rows: ClientTransaction[]): Promise<void> {
    const deletable = rows.filter((row) => !isTransferLeg(row));
    const skipped = rows.length - deletable.length;

    await Promise.all(deletable.map((row) => deleteTransactionAction(row.id)));

    invalidateAllTransactionLists(queryClient);
    notifySuccess(
      `${deletable.length} transação(ões) excluída(s)${skipped ? ` — ${skipped} de transferência ignorada(s)` : ""}`,
    );
    onMutated();
  }

  async function bulkMarkPaid(rows: ClientTransaction[]): Promise<void> {
    const updatable = rows.filter((row) => !isTransferLeg(row) && !row.isPaid);

    await Promise.all(updatable.map((row) => updateTransactionAction(row.id, { isPaid: true })));

    invalidateAllTransactionLists(queryClient);
    notifySuccess(`${updatable.length} transação(ões) marcada(s) como paga(s)`);
    onMutated();
  }

  /**
   * Ação de linha "Marcar como paga" (`TransactionRowActions`) — mesma regra
   * de `bulkMarkPaid` + `isCardTransaction`: transação de cartão nunca é
   * marcada paga por linha (ver JSDoc de `isCardTransaction`).
   */
  async function markPaid(row: ClientTransaction): Promise<void> {
    if (isTransferLeg(row) || isCardTransaction(row) || row.isPaid) return;

    const result = await updateTransactionAction(row.id, { isPaid: true });
    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    invalidateAllTransactionLists(queryClient);
    notifySuccess("Transação marcada como paga");
    onMutated();
  }

  return { deleteOne, bulkDelete, bulkMarkPaid, markPaid };
}
