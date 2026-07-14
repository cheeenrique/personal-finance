"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";
import { settleLoanAction } from "@/modules/loans/actions";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";

type SettleLoanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  description: string;
  /** Número de parcelas ainda não pagas — só informativo (docs da tarefa: "sem preview fácil, mostra 'vai quitar todas as N parcelas restantes'"). */
  remainingCount: number;
  /** Chamado após quitar com sucesso — o caller decide o que refrescar (`router.refresh()` em `loan-detail-view.tsx`). */
  onSettled: () => void;
};

/**
 * Quitação total do empréstimo (docs da tarefa, "Quitar") — sem endpoint de
 * preview separado (`settleLoanAction` já CALCULA e GRAVA na mesma chamada,
 * ver `modules/loans/service.ts` `settleLoan`), então o dialog não mostra um
 * total sugerido antecipado: informa quantas parcelas serão quitadas e
 * deixa um campo OPCIONAL pro usuário travar o total (`totalPaid`) — vazio
 * = usa o valor presente somado automaticamente. O total efetivo volta no
 * toast de sucesso.
 */
export function SettleLoanDialog({ open, onOpenChange, loanId, description, remainingCount, onSettled }: SettleLoanDialogProps) {
  const queryClient = useQueryClient();
  const [totalPaid, setTotalPaid] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setFormError(null);

    startTransition(async () => {
      const result = await settleLoanAction(loanId, {
        settleDate: toDateInputValueSaoPaulo(),
        totalPaid: totalPaid.trim() ? totalPaid : undefined,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      invalidateAllTransactionLists(queryClient);
      notifySuccess(`Empréstimo quitado — total pago: ${formatBRL(result.data)}`);
      onSettled();
      onOpenChange(false);
      setTotalPaid("");
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Quitar “${description}”?`}
      description={`Isso vai marcar as ${remainingCount} parcela${remainingCount === 1 ? "" : "s"} restante${
        remainingCount === 1 ? "" : "s"
      } como paga${remainingCount === 1 ? "" : "s"} hoje, aplicando desconto de antecipação se o empréstimo tiver juros configurado.`}
    >
      <div className="flex flex-col gap-4">
        <FormField label="Valor total (opcional)" htmlFor="settle-total-paid" error={formError}>
          <CurrencyInput
            id="settle-total-paid"
            value={totalPaid}
            onValueChange={setTotalPaid}
            aria-invalid={Boolean(formError)}
            disabled={isPending}
          />
        </FormField>
        <p className="-mt-2 text-[12px] font-medium text-muted-foreground">
          Deixe em branco para usar o valor sugerido automaticamente (soma do valor presente das parcelas).
        </p>

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="accent" onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Quitar empréstimo
          </Button>
        </div>
      </div>
    </FormModal>
  );
}
