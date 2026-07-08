import { CircleCheck, Copy, Eye, Pencil, Trash2 } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { canDuplicate, isCardTransaction, isTransferLeg } from "./use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";

type TransactionRowActionsProps = {
  row: ClientTransaction;
  onView: () => void;
  onMarkPaid: () => void;
  onEdit: () => void;
  /** Omitido ⇒ o botão "Duplicar" não aparece — caller que ainda não tem onde abrir o modal pré-preenchido (ex.: fatura do cartão, `invoice-items-table.tsx`) simplesmente não passa esta prop. */
  onDuplicate?: () => void;
  onDelete: () => void;
};

/**
 * Ações de linha das tabelas que reaproveitam `buildTransactionColumns`
 * (`/transactions`, histórico da conta em `/accounts/[id]`, fatura do cartão
 * de crédito, cartão alimentação e preview "Últimas transações" do Dashboard)
 * — extraído daqui em vez de duplicado em cada uma (rule 02-dry-kiss-yagni,
 * "3 ocorrências = extrair").
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
 *
 * "Duplicar" (docs/50-AUDITORIA-BACKLOG.md F5) reusa a mesma restrição de
 * elegibilidade de "Editar" + `CARD_PAYMENT` (ver `canDuplicate`) — o modal de
 * criação só sabe INCOME/EXPENSE.
 */
export function TransactionRowActions({ row, onView, onMarkPaid, onEdit, onDuplicate, onDelete }: TransactionRowActionsProps) {
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
      {onDuplicate && (
        <IconActionButton
          icon={Copy}
          label="Duplicar"
          onClick={onDuplicate}
          disabled={!canDuplicate(row)}
          disabledReason={isTransfer ? "Transferências não podem ser duplicadas aqui" : "Pagamento de fatura não pode ser duplicado"}
        />
      )}
      <IconActionButton
        icon={Trash2}
        tone="danger"
        label={isTransfer ? "Excluir transferência" : "Excluir"}
        onClick={onDelete}
      />
    </>
  );
}
