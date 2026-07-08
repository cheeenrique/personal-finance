"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";
import { updateLoanAction } from "@/modules/loans/actions";
import { notifySuccess } from "@/lib/toast";

type UpdateInstallmentAmountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  /** Valor atual da parcela (`Loan.installmentAmount`) — pré-preenche o campo. */
  currentAmount: string;
  /** Chamado após atualizar com sucesso — o caller decide o que refrescar (`router.refresh()` em `financing-detail-view.tsx`). */
  onUpdated: () => void;
};

/**
 * Atualiza SÓ o valor da parcela do financiamento (docs da tarefa,
 * "Atualizar valor da parcela") — a parcela do apto varia por TR, então o
 * dono quer trocar 1 número e ver as parcelas FUTURAS acompanharem sem abrir
 * o formulário de edição completo (`FinancingFormModal`). Manda só
 * `{ installmentAmount }` pra `updateLoanAction` — `modules/loans/update.ts`
 * já regenera as parcelas NÃO PAGAS com o novo valor e recomputa `totalToPay`
 * (pagas mantidas intactas, ver JSDoc de `updateLoan`/`recomputeTotalToPay`).
 */
export function UpdateInstallmentAmountDialog({
  open,
  onOpenChange,
  loanId,
  currentAmount,
  onUpdated,
}: UpdateInstallmentAmountDialogProps) {
  const [amount, setAmount] = useState(currentAmount);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset ao abrir — "adjusting state when a prop changes"
  // (react.dev/learn/you-might-not-need-an-effect), feito durante o render,
  // mesmo padrão de `FinancingSimulateModal`/`LoanFormModal`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAmount(currentAmount);
      setFormError(null);
    }
  }

  function handleConfirm() {
    setFormError(null);

    startTransition(async () => {
      const result = await updateLoanAction(loanId, { installmentAmount: amount });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess("Valor da parcela atualizado");
      onUpdated();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Atualizar valor da parcela</DialogTitle>
          <DialogDescription>
            As parcelas FUTURAS (não pagas) serão atualizadas pra esse valor; as pagas não mudam.
          </DialogDescription>
        </DialogHeader>

        <FormField label="Novo valor da parcela" htmlFor="update-installment-amount" error={formError}>
          <CurrencyInput
            id="update-installment-amount"
            value={amount}
            onValueChange={setAmount}
            aria-invalid={Boolean(formError)}
            disabled={isPending}
          />
        </FormField>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="accent" onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Atualizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
