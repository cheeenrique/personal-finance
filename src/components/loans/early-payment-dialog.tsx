"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";
import { suggestEarlyPaymentAction } from "@/modules/loans/actions";
import { updateTransactionAction } from "@/modules/transactions/actions";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo, toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifyError, notifySuccess } from "@/lib/toast";

/** Parcela alvo da antecipação — subconjunto de `LoanInstallmentView` (id/valor/vencimento). */
export type EarlyPaymentInstallment = { id: string; amount: string; date: string };

type EarlyPaymentDialogProps = {
  loanId: string;
  /** `null` = fechado. Presente = parcela sendo antecipada. */
  installment: EarlyPaymentInstallment | null;
  onOpenChange: (open: boolean) => void;
  /** Chamado após confirmar o pagamento com sucesso — o caller decide o que refrescar (`router.refresh()` em `loan-detail-view.tsx`). */
  onConfirmed: () => void;
};

/**
 * Mini-dialog de antecipação (docs da tarefa, "Antecipação editável") —
 * aberto quando o usuário marca como paga uma parcela FUTURA de um
 * empréstimo COM juros configurado (`loan-detail-view.tsx` decide quando
 * abrir, este componente só cuida do fluxo: busca a sugestão de desconto
 * (`suggestEarlyPaymentAction`, só CALCULA) e confirma com o valor
 * EDITÁVEL via `updateTransactionAction` (mesmo caminho que já marca
 * qualquer parcela como paga, ver JSDoc de `modules/loans/service.ts`
 * `suggestEarlyPayment`: o desconto é só ponto de partida, o usuário pode
 * mudar livremente antes de confirmar).
 */
export function EarlyPaymentDialog({ loanId, installment, onOpenChange, onConfirmed }: EarlyPaymentDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullAmount, setFullAmount] = useState<string | null>(null);
  const [discount, setDiscount] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = Boolean(installment);

  // Busca a sugestão sempre que uma nova parcela é aberta — efeito legítimo
  // (sincroniza com o server), `setState` sempre dentro do `.then()`, mesmo
  // padrão de `LoanFormModal`.
  useEffect(() => {
    if (!installment) return;

    Promise.resolve()
      .then(() => {
        setLoading(true);
        setLoadError(null);
        setFullAmount(null);
        setDiscount(null);
        setAmount("");
        return suggestEarlyPaymentAction(loanId, {
          installmentId: installment.id,
          paymentDate: toDateInputValueSaoPaulo(),
        });
      })
      .then((result) => {
        if (!result.success) {
          setLoadError(result.error.message);
          return;
        }
        setFullAmount(result.data.fullAmount);
        setDiscount(result.data.discount);
        setAmount(result.data.suggested);
      })
      .finally(() => setLoading(false));
  }, [loanId, installment]);

  function handleConfirm() {
    if (!installment) return;
    setFormError(null);

    if (!amount || Number(amount) <= 0) {
      setFormError("Informe um valor válido.");
      return;
    }

    startTransition(async () => {
      const result = await updateTransactionAction(installment.id, { isPaid: true, amount });
      if (!result.success) {
        notifyError(result.error.message);
        return;
      }

      invalidateAllTransactionLists(queryClient);
      notifySuccess("Parcela marcada como paga");
      onConfirmed();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Antecipar parcela</DialogTitle>
          <DialogDescription>
            {installment && `Vencimento em ${formatDateSaoPaulo(installment.date)} — o valor sugerido já aplica o desconto de antecipação.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm font-medium text-muted-foreground">Calculando desconto…</p>
        ) : loadError ? (
          <p className="text-sm font-medium text-destructive">{loadError}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2.5 text-sm">
              <span className="font-semibold text-muted-foreground">Valor cheio</span>
              <span className="font-mono font-bold text-foreground">{fullAmount ? formatBRL(fullAmount) : "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2.5 text-sm">
              <span className="font-semibold text-muted-foreground">Desconto</span>
              <span className="font-mono font-bold text-on-success">{discount ? formatBRL(discount) : "—"}</span>
            </div>

            <FormField label="Valor a pagar" htmlFor="early-payment-amount" required error={formError}>
              <CurrencyInput
                id="early-payment-amount"
                value={amount}
                onValueChange={setAmount}
                aria-invalid={Boolean(formError)}
                disabled={isPending}
              />
            </FormField>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isPending || loading || Boolean(loadError)}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
