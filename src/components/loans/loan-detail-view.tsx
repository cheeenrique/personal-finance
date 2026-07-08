"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Check, HandCoins, PiggyBank, Pencil, ShieldCheck, Trash2, TrendingDown, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { IconActionButton } from "@/components/shared/icon-action-button";
import { Button } from "@/components/ui/button";
import { deleteLoanAction } from "@/modules/loans/actions";
import { updateTransactionAction } from "@/modules/transactions/actions";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo, toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifyError, notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { LoanFormModal } from "./loan-form-modal";
import { EarlyPaymentDialog, type EarlyPaymentInstallment } from "./early-payment-dialog";
import { SettleLoanDialog } from "./settle-loan-dialog";
import type { LoanDetailData, LoanInstallmentView } from "./types";

type LoanDetailViewProps = { loan: LoanDetailData };

type InstallmentRow = LoanInstallmentView & { number: number };

/** `YYYY-MM-DD` (mesmo formato de `toDateInputValueSaoPaulo`) ordena lexicograficamente como data — comparação de string basta, sem precisar de `date-fns`. */
function isFutureInSaoPaulo(dateIso: string): boolean {
  return toDateInputValueSaoPaulo(dateIso) > toDateInputValueSaoPaulo();
}

/**
 * Detalhe de `/loans/[id]`: KPIs (principal/total/juros/saldo devedor),
 * progresso e a lista completa das parcelas (sem paginação — mesmo racional
 * de `InstallmentDetailsModal`: lista de tamanho fixo definido na criação,
 * não cresce sem limite como Transactions, docs/04-DESIGN_SYSTEM.md,
 * "Tabelas"). Editar reaproveita `LoanFormModal` em modo edição
 * (`updateLoanAction`). "Marcar como paga" reaproveita `updateTransactionAction`
 * do módulo de transações — a parcela do empréstimo É uma Transaction
 * (`modules/loans/installments.ts` `createLoan`) — exceto quando o
 * empréstimo tem juros configurado E a parcela vence no futuro: aí abre
 * `EarlyPaymentDialog` (desconto de antecipação editável, docs da tarefa).
 * Excluir usa `deleteLoanAction` + `ConfirmDialog`, mesmo padrão de
 * `AccountGrid`. Quitar (`SettleLoanDialog`) só aparece havendo parcela não
 * paga.
 */
export function LoanDetailView({ loan }: LoanDetailViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [earlyPaymentInstallment, setEarlyPaymentInstallment] = useState<EarlyPaymentInstallment | null>(null);

  const percent = (Number(loan.paidAmount) / Number(loan.totalToPay)) * 100;
  const isSettled = Number(loan.remainingAmount) <= 0;
  const hasInterest = Boolean(loan.interestRate);

  const rows: InstallmentRow[] = loan.installments.map((installment, index) => ({
    ...installment,
    number: index + 1,
  }));
  const unpaidRows = rows.filter((row) => !row.isPaid);

  async function markPaidInFull(installmentId: string) {
    setPendingId(installmentId);
    const result = await updateTransactionAction(installmentId, { isPaid: true });
    setPendingId(null);

    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    // A parcela também pode aparecer em `/transactions`/`/accounts/[id]` —
    // invalida o cache client-side de todas as listagens de transação
    // (mesmo padrão de `useTransactionMutations`), além de atualizar o
    // progresso desta própria página (Server Component).
    invalidateAllTransactionLists(queryClient);
    notifySuccess("Parcela marcada como paga");
    router.refresh();
  }

  /**
   * Sem juros configurado OU vencimento já passou/é hoje → marca paga no
   * valor cheio direto (fluxo simples intacto, sem dialog). Com juros E
   * vencimento futuro → abre `EarlyPaymentDialog` (sugestão de desconto
   * editável) em vez de gravar direto (docs da tarefa, "Antecipação").
   */
  function handleMarkPaid(row: InstallmentRow) {
    if (hasInterest && isFutureInSaoPaulo(row.date)) {
      setEarlyPaymentInstallment({ id: row.id, amount: row.amount, date: row.date });
      return;
    }
    void markPaidInFull(row.id);
  }

  async function handleDelete() {
    const result = await deleteLoanAction(loan.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Empréstimo excluído");
    router.push("/loans");
  }

  const columns: DataTableColumn<InstallmentRow>[] = [
    { key: "number", header: "Parcela", render: (row) => `${row.number}/${loan.installmentsCount}` },
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-primary/18 text-on-primary">
            <HandCoins className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-foreground">{loan.description}</h2>
            {loan.lender && <p className="text-[13px] font-semibold text-muted-foreground">{loan.lender}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {unpaidRows.length > 0 && (
            <Button type="button" variant="accent" onClick={() => setSettleOpen(true)}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              Quitar empréstimo
            </Button>
          )}

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={`Editar ${loan.description}`}
            className="flex size-9 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>

          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Excluir empréstimo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard icon={Wallet} title="Valor emprestado" value={formatBRL(loan.principal)} tone="neutral" />
        <KPICard icon={PiggyBank} title="Total a pagar" value={formatBRL(loan.totalToPay)} tone="neutral" />
        <KPICard icon={TrendingDown} title="Juros" value={formatBRL(loan.interest)} tone="warning" />
        <KPICard
          icon={HandCoins}
          title="Saldo devedor"
          value={formatBRL(loan.remainingAmount)}
          tone={isSettled ? "success" : "danger"}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <ProgressBar
          percent={percent}
          tone="neutral"
          label={`${loan.paidCount}/${loan.installmentsCount} parcelas pagas · ${formatBRL(loan.paidAmount)} de ${formatBRL(loan.totalToPay)}`}
        />
      </div>

      {loan.disbursement && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-success/16 text-on-success">
              <ArrowDownToLine className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-muted-foreground">Entrada recebida</p>
              <p className="font-mono text-lg font-semibold text-foreground">
                {formatBRL(loan.disbursement.amount)}
              </p>
            </div>
          </div>
          <span className="text-sm font-semibold text-muted-foreground">
            {formatDateSaoPaulo(loan.disbursement.date)}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-foreground">Parcelas</h3>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          emptyState={{ icon: HandCoins, title: "Nenhuma parcela encontrada" }}
          rowActions={(row) =>
            row.isPaid ? null : (
              <IconActionButton
                icon={Check}
                label="Marcar como paga"
                onClick={() => handleMarkPaid(row)}
                disabled={pendingId === row.id}
              />
            )
          }
        />
      </div>

      <LoanFormModal open={editOpen} onOpenChange={setEditOpen} loan={loan} onSaved={() => router.refresh()} />

      <EarlyPaymentDialog
        loanId={loan.id}
        installment={earlyPaymentInstallment}
        onOpenChange={(open) => {
          if (!open) setEarlyPaymentInstallment(null);
        }}
        onConfirmed={() => router.refresh()}
      />

      <SettleLoanDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        loanId={loan.id}
        description={loan.description}
        remainingCount={unpaidRows.length}
        onSettled={() => router.refresh()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir "${loan.description}"?`}
        description="Parcelas futuras ainda não pagas são removidas junto. Parcelas já pagas continuam no histórico."
        onConfirm={handleDelete}
      />
    </div>
  );
}
