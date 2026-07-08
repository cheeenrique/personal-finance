"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Coins,
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteLoanAction } from "@/modules/loans/actions";
import { updateTransactionAction } from "@/modules/transactions/actions";
import { EarlyPaymentDialog, type EarlyPaymentInstallment } from "@/components/loans/early-payment-dialog";
import { SettleLoanDialog } from "@/components/loans/settle-loan-dialog";
import { LoanInstallmentsTable, type LoanInstallmentRow } from "@/components/loans/loan-installments-table";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifyError, notifySuccess } from "@/lib/toast";
import { FinancingFormModal } from "./financing-form-modal";
import { FinancingSimulateModal } from "./financing-simulate-modal";
import { FinancingContractSummary } from "./financing-contract-summary";
import { UpdateInstallmentAmountDialog } from "./update-installment-amount-dialog";
import type { FinancingDetailData } from "./types";

type FinancingDetailViewProps = { financing: FinancingDetailData };

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
  const [updateInstallmentOpen, setUpdateInstallmentOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [earlyPaymentInstallment, setEarlyPaymentInstallment] = useState<EarlyPaymentInstallment | null>(null);

  const percent = (Number(financing.paidAmount) / Number(financing.totalToPay)) * 100;
  const isSettled = Number(financing.remainingAmount) <= 0;
  const hasInterest = Boolean(financing.interestRate);

  const unpaidRows = financing.installments.filter((row) => !row.isPaid);
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

  function handleMarkPaid(row: LoanInstallmentRow) {
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
          {/*
            Desabilitado a pedido do dono: o simulador atual só cobre o modelo
            C6 (por quantidade de parcelas), que não serve pro financiamento
            por valor/prazo (Caixa etc.) — ver docs/52-FINANCING-ANTECIPACAO.md.
            Código do modal/simulador mantido intacto (`FinancingSimulateModal`
            abaixo) pra reabilitar quando o 2º modelo estiver pronto — só o
            gatilho fica bloqueado.
          */}
          {unpaidRows.length > 0 && (
            <Tooltip>
              <TooltipTrigger render={<Button type="button" variant="default" size="lg" disabled />}>
                <Sparkles className="size-4" aria-hidden="true" />
                Simular antecipação
              </TooltipTrigger>
              <TooltipContent>Em breve — simulação em revisão para este tipo de financiamento.</TooltipContent>
            </Tooltip>
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
              {unpaidRows.length > 0 && (
                <DropdownMenuItem onClick={() => setUpdateInstallmentOpen(true)}>
                  <Coins className="size-4" aria-hidden="true" />
                  Atualizar valor da parcela
                </DropdownMenuItem>
              )}
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
        <LoanInstallmentsTable
          installments={financing.installments}
          installmentsCount={financing.installmentsCount}
          pendingId={pendingId}
          onMarkPaid={handleMarkPaid}
          emptyIcon={Landmark}
        />
      </div>

      <FinancingFormModal open={editOpen} onOpenChange={setEditOpen} financing={financing} onSaved={refresh} />

      <UpdateInstallmentAmountDialog
        open={updateInstallmentOpen}
        onOpenChange={setUpdateInstallmentOpen}
        loanId={financing.id}
        currentAmount={financing.installmentAmount}
        onUpdated={refresh}
      />

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
