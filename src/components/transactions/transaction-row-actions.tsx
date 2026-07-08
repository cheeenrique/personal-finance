import { CircleCheck, Eye, Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { isCardTransaction, isTransferLeg } from "./use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";

type TransactionRowActionsProps = {
  row: ClientTransaction;
  onView: () => void;
  onMarkPaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Ações de linha das 4 tabelas que reaproveitam `buildTransactionColumns`
 * (`/transactions`, histórico da conta em `/accounts/[id]`, fatura do cartão
 * de crédito e cartão alimentação) — extraído daqui em vez de duplicado em
 * cada uma (rule 02-dry-kiss-yagni, "3 ocorrências = extrair"; eram 4).
 *
 * "Marcar como paga" só aparece em linha PENDENTE (`!row.isPaid`) de CONTA
 * (`!isCardTransaction`) — transação de cartão não tem esse controle por
 * linha (cobrança é confirmada na compra; quem paga é a fatura, ver JSDoc de
 * `isCardTransaction`). Perna de TRANSFER: editar segue desabilitado (sem
 * propagação de edição pro par, ver `isTransferLeg`), mas EXCLUIR é
 * permitido — o backend soft-deleta as 2 pernas juntas; o label vira
 * "Excluir transferência" e o ConfirmDialog do caller explica o efeito nas
 * 2 contas. `isTransferLeg` é sempre `false` pra transações de cartão (nunca
 * têm `transferId`), então nada muda nas tabelas de cartão.
 */
export function TransactionRowActions({ row, onView, onMarkPaid, onEdit, onDelete }: TransactionRowActionsProps) {
  const isTransfer = isTransferLeg(row);

  return (
    <>
      {!row.isPaid && !isCardTransaction(row) && (
        <IconActionButton icon={CircleCheck} tone="success" label="Marcar como paga" onClick={onMarkPaid} />
      )}
      <IconActionButton icon={Eye} label="Ver detalhes" onClick={onView} />
      <IconActionButton
        icon={Pencil}
        label="Editar"
        onClick={onEdit}
        disabled={isTransfer}
        disabledReason="Transferências não são editáveis aqui"
      />
      <IconActionButton
        icon={Trash2}
        tone="danger"
        label={isTransfer ? "Excluir transferência" : "Excluir"}
        onClick={onDelete}
      />
    </>
  );
}
