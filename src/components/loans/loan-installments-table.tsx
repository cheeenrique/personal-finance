"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { IconActionButton } from "@/components/shared/icon-action-button";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";
import type { LoanInstallmentView } from "./types";

export type LoanInstallmentRow = LoanInstallmentView & { number: number };

const PAGE_SIZE = 20;

/**
 * ~10 linhas visíveis (thead + 10 parcelas) antes do scroll interno + rodapé
 * de paginação abaixo (docs da tarefa "Paginação na tabela de parcelas") —
 * um financiamento de centenas de parcelas (ex.: apto, 326x) não pode
 * despejar tudo de uma vez e dominar a tela. Valor fixo em vez de uma prop
 * configurável: hoje só este componente usa esse layout, sem 2º caller com
 * necessidade diferente (rule 02-dry-kiss-yagni).
 */
const TABLE_HEIGHT_CLASS = "h-[520px]";

type LoanInstallmentsTableProps = {
  installments: LoanInstallmentView[];
  installmentsCount: number;
  pendingId: string | null;
  onMarkPaid: (row: LoanInstallmentRow) => void;
  emptyIcon: LucideIcon;
};

/**
 * Tabela de parcelas compartilhada por `/loans/[id]` e `/financings/[id]`
 * (mesmas colunas/linha nos dois, antes duplicadas em `LoanDetailView`/
 * `FinancingDetailView`) — paginação CLIENT-SIDE (20/página, mesmo visual de
 * `DataTablePagination` usado em `/transactions`, via `DataTable.pagination`).
 *
 * Diferente de Transactions/histórico de conta (paginação SERVER-side,
 * docs/04-DESIGN_SYSTEM.md "Tabelas"): a lista de parcelas de um empréstimo/
 * financiamento tem tamanho FIXO definido na criação do contrato, não cresce
 * sem limite — o Server Component já carrega TODAS de uma vez
 * (`loanService.getLoanDetail`), então paginar aqui é só fatiar o array já
 * carregado, sem round-trip nenhum ao servidor por página.
 */
export function LoanInstallmentsTable({
  installments,
  installmentsCount,
  pendingId,
  onMarkPaid,
  emptyIcon,
}: LoanInstallmentsTableProps) {
  const [page, setPage] = useState(1);

  // Parcelas já vêm ordenadas por data asc do repository (nº da parcela =
  // posição no array) — pagas e futuras juntas, na mesma ordem/paginação.
  const rows: LoanInstallmentRow[] = installments.map((installment, index) => ({
    ...installment,
    number: index + 1,
  }));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: DataTableColumn<LoanInstallmentRow>[] = [
    { key: "number", header: "Parcela", render: (row) => `${row.number}/${installmentsCount}` },
    { key: "date", header: "Vencimento", render: (row) => formatDateSaoPaulo(row.date) },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      render: (row) => <span className="font-mono font-semibold text-foreground">{formatBRL(row.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
            row.isPaid ? "bg-success/16 text-on-success" : "bg-warning/16 text-on-warning",
          )}
        >
          {row.isPaid ? "Paga" : "Pendente"}
        </span>
      ),
    },
  ];

  return (
    <div className={TABLE_HEIGHT_CLASS}>
      <DataTable
        data={pageRows}
        columns={columns}
        getRowId={(row) => row.id}
        fillHeight
        emptyState={{ icon: emptyIcon, title: "Nenhuma parcela encontrada" }}
        rowActions={(row) =>
          row.isPaid ? null : (
            <IconActionButton
              icon={Check}
              label="Marcar como paga"
              onClick={() => onMarkPaid(row)}
              disabled={pendingId === row.id}
            />
          )
        }
        pagination={{ page, pageSize: PAGE_SIZE, total: rows.length, onPageChange: setPage }}
      />
    </div>
  );
}
