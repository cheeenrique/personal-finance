"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Check,
  Landmark,
  MoreVertical,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  Wallet,
} from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { IconActionButton } from "@/components/shared/icon-action-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteLoanAction } from "@/modules/loans/actions";
import { updateTransactionAction } from "@/modules/transactions/actions";
import { EarlyPaymentDialog, type EarlyPaymentInstallment } from "@/components/loans/early-payment-dialog";
import { SettleLoanDialog } from "@/components/loans/settle-loan-dialog";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo, toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifyError, notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { FinancingFormModal } from "./financing-form-modal";
import { FinancingSimulateModal } from "./financing-simulate-modal";
import { FinancingContractSummary } from "./financing-contract-summary";
import type { FinancingDetailData, LoanInstallmentView } from "./types";

type FinancingDetailViewProps = { financing: FinancingDetailData };

type InstallmentRow = LoanInstallmentView & { number: number };

/** `YYYY-MM-DD` ordena lexicograficamente como data — mesma técnica de `loan-detail-view.tsx`. */
function isFutureInSaoPaulo(dateIso: string): boolean {
  return toDateInputValueSaoPaulo(dateIso) > toDateInputValueSaoPaulo();
}

/**
 * Detalhe de `/financings/[id]` — espelha `LoanDetailView`
 * (`components/loans/loan-detail-view.tsx`), + a seção "Contrato"
 * (`FinancingContractSummary`) e o botão "Simular antecipação"
 * (`FinancingSimulateModal`, modelo C6). Reusa DIRETO os componentes
 * genéricos do módulo Empréstimo que não têm nada de `kind`-específico:
 * `EarlyPaymentDialog`/`SettleLoanDialog` (operam só sobre `loanId` +
 * parcela, mesmo mecanismo pra LOAN ou FINANCING) e `deleteLoanAction`
 * (`modules/loans/actions.ts`, genérico por `Loan.id`).
 *
 * `router.refresh()` explícito após TODA mutação (edição/quitação/
 * antecipação/parcela paga) — diferente de `LoanDetailView`, que confia em
 * `revalidatePath("/loans")` (`modules/loans/action-helpers.ts`,
 * `revalidateLoanRoutes`) pro PRÓPRIO `/loans/[id]` também recarregar via
 * client-side navigation cache; aqui a rota é `/financings/[id]`, que essas
 * actions não conhecem (não podemos tocar `modules/*` pra ensinar isso a
 * elas).
 */
export function FinancingDetailView({ financing }: FinancingDetailViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [earlyPaymentInstallment, setEarlyPaymentInstallment] = useState<EarlyPaymentInstallment | null>(null);

  const percent = (Number(financing.paidAmount) / Number(financing.totalToPay)) * 100;
  const isSettled = Number(financing.remainingAmount) <= 0;
  const hasInterest = Boolean(financing.interestRate);

  const rows: InstallmentRow[] = financing.installments.map((installment, index) => ({
    ...installment,
    number: index + 1,
  }));
  const unpaidRows = rows.filter((row) => !row.isPaid);
  const nextDueDate = unpaidRows[0]?.date ?? null;

  const settleDiscount =
    financing.settleTodayAmount !== null
      ? Number(financing.remainingAmount) - Number(financing.settleTodayAmount)
      : 0;

  function refresh() {
    router.refresh();
  }

  async function markPaidInFull(installmentId: string) {
    setPendingId(installmentId);
    const result = await updateTransactionAction(installmentId, { isPaid: true });
    setPendingId(null);

    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    invalidateAllTransactionLists(queryClient);
    notifySuccess("Parcela marcada como paga");
    refresh();
  }

  function handleMarkPaid(row: InstallmentRow) {
    if (hasInterest && isFutureInSaoPaulo(row.date)) {
      setEarlyPaymentInstallment({ id: row.id, amount: row.amount, date: row.date });
      return;
    }
    void markPaidInFull(row.id);
  }

  async function handleDelete() {
    const result = await deleteLoanAction(financing.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Financiamento excluído");
    router.push("/financings");
  }

  const columns: DataTableColumn<InstallmentRow>[] = [
    { key: "number", header: "Parcela", render: (row) => `${row.number}/${financing.installmentsCount}` },
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
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-foreground">{financing.description}</h2>
            {financing.lender && <p className="text-[13px] font-semibold text-muted-foreground">{financing.lender}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {unpaidRows.length > 0 && (
            <Button type="button" variant="default" size="lg" onClick={() => setSimulateOpen(true)}>
              <Sparkles className="size-4" aria-hidden="true" />
              Simular antecipação
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="neutral"
                  size="icon-md"
                  aria-label={`Mais ações para ${financing.description}`}
                />
              }
            >
              <MoreVertical className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {unpaidRows.length > 0 && (
                <DropdownMenuItem onClick={() => setSettleOpen(true)}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Quitar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" aria-hidden="true" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" aria-hidden="true" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard icon={Wallet} title="Valor financiado" value={formatBRL(financing.principal)} tone="neutral" />
        <KPICard icon={Banknote} title="Total a pagar" value={formatBRL(financing.totalToPay)} tone="neutral" />
        <KPICard icon={TrendingDown} title="Juros" value={formatBRL(financing.interest)} tone="warning" />
        <KPICard
          icon={Landmark}
          title="Saldo devedor"
          value={formatBRL(financing.remainingAmount)}
          tone={isSettled ? "success" : "danger"}
        />
      </div>

      {financing.settleTodayAmount !== null && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
          <div>
            <p className="text-[13px] font-semibold text-muted-foreground">Quitar hoje (valor presente)</p>
            <p className="font-mono text-lg font-semibold text-foreground">{formatBRL(financing.settleTodayAmount)}</p>
          </div>
          {settleDiscount > 0 && (
            <span className="rounded-full bg-success/16 px-2.5 py-1 text-xs font-bold text-on-success">
              desconto de {formatBRL(settleDiscount)}
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <ProgressBar
          percent={percent}
          tone="neutral"
          label={`${financing.paidCount}/${financing.installmentsCount} parcelas pagas · ${formatBRL(financing.paidAmount)} de ${formatBRL(financing.totalToPay)}`}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-extrabold text-foreground">Contrato</h3>
        <FinancingContractSummary
          fields={{
            amortizationSystem: financing.amortizationSystem,
            downPayment: financing.downPayment,
            assetValue: financing.assetValue,
            assetId: financing.assetId,
            assetName: financing.assetName,
            cet: financing.cet,
            operationRef: financing.operationRef,
            financedTaxes: financing.financedTaxes,
            financedInsurance: financing.financedInsurance,
            financedFees: financing.financedFees,
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-foreground">Parcelas</h3>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          emptyState={{ icon: Landmark, title: "Nenhuma parcela encontrada" }}
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

      <FinancingFormModal open={editOpen} onOpenChange={setEditOpen} financing={financing} onSaved={refresh} />

      <EarlyPaymentDialog
        loanId={financing.id}
        installment={earlyPaymentInstallment}
        onOpenChange={(open) => {
          if (!open) setEarlyPaymentInstallment(null);
        }}
        onConfirmed={refresh}
      />

      <SettleLoanDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        loanId={financing.id}
        description={financing.description}
        remainingCount={unpaidRows.length}
        onSettled={refresh}
      />

      {nextDueDate && (
        <FinancingSimulateModal
          open={simulateOpen}
          onOpenChange={setSimulateOpen}
          loanId={financing.id}
          unpaidCount={unpaidRows.length}
          nextDueDate={nextDueDate}
          onConfirmed={refresh}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir "${financing.description}"?`}
        description="Remove o financiamento e todas as parcelas do sistema — pagas e pendentes. O saldo das contas volta ao estado de antes do financiamento. Esta ação não pode ser desfeita."
        onConfirm={handleDelete}
      />
    </div>
  );
}
