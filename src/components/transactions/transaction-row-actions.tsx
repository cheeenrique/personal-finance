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
 * `isCardTransaction`). Editar/excluir seguem desabilitados pra pernas de
 * TRANSFER (mesma regra de antes da extração — `isTransferLeg` sempre
 * `false` pra transações de cartão, que nunca têm `transferId`, então o
 * guard não muda comportamento lá).
 */
export function TransactionRowActions({ row, onView, onMarkPaid, onEdit, onDelete }: TransactionRowActionsProps) {
  const disabled = isTransferLeg(row);

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
        disabled={disabled}
        disabledReason="Transferências não são editáveis aqui"
      />
      <IconActionButton
        icon={Trash2}
        tone="danger"
        label="Excluir"
        onClick={onDelete}
        disabled={disabled}
        disabledReason="Transferências não são excluídas aqui"
      />
    </>
  );
}
