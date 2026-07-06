"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import type { TransactionsReferenceData } from "./use-transactions-reference-data";
import { createTransferAction } from "@/modules/accounts/actions";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";

type TransferFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceData: TransactionsReferenceData;
  onSaved: () => void;
};

/**
 * Entry point de Transferência a partir da tela de Transações
 * (docs/06-SCREENS.md, "Transações": "form em si pode viver aqui ou reutilizar
 * do módulo accounts"). Gera as 2 pernas (EXPENSE/INCOME com `transferId`
 * compartilhado) via `createTransferAction` — nunca cria `type=TRANSFER`
 * diretamente (docs/20-TRANSACTIONS.md, "Transferência").
 */
export function TransferFormModal({ open, onOpenChange, referenceData, onSaved }: TransferFormModalProps) {
  const [fromAccountId, setFromAccountId] = useState<string | undefined>(undefined);
  const [toAccountId, setToAccountId] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Transferência entre contas");
  const [date, setDate] = useState(toDateInputValueSaoPaulo());
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  const accountOptions = referenceData.originOptions
    .filter((option) => option.group === "Contas")
    .map((option) => ({ ...option, value: option.value.replace("account:", "") }));

  function resetForm() {
    setFromAccountId(undefined);
    setToAccountId(undefined);
    setAmount("");
    setDescription("Transferência entre contas");
    setDate(toDateInputValueSaoPaulo());
    setFieldErrors({});
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!fromAccountId) errors.fromAccountId = "Selecione a conta de origem.";
    if (!toAccountId) errors.toAccountId = "Selecione a conta de destino.";
    if (isBlank(amount)) errors.amount = "Informe um valor.";
    if (isBlank(description)) errors.description = "Descrição é obrigatória.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (fromAccountId === toAccountId) {
      setFormError("Conta de origem e destino devem ser diferentes.");
      return;
    }

    startTransition(async () => {
      const result = await createTransferAction({ fromAccountId, toAccountId, amount, date, description });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess("Transferência registrada");
      resetForm();
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Nova transferência"
      description="Move dinheiro entre duas contas — gera as duas pernas automaticamente."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          label="Conta de origem"
          htmlFor="transfer-tx-from-account"
          required
          error={fieldErrors.fromAccountId}
        >
          <EntitySelect
            id="transfer-tx-from-account"
            options={accountOptions}
            value={fromAccountId}
            onValueChange={(value) => {
              setFromAccountId(value);
              clearFieldError("fromAccountId");
            }}
            placeholder={referenceData.loading ? "Carregando…" : "Selecione a conta de origem"}
            disabled={isPending || referenceData.loading}
            aria-invalid={Boolean(fieldErrors.fromAccountId)}
          />
        </FormField>

        <FormField
          label="Conta de destino"
          htmlFor="transfer-tx-to-account"
          required
          error={fieldErrors.toAccountId}
        >
          <EntitySelect
            id="transfer-tx-to-account"
            options={accountOptions}
            value={toAccountId}
            onValueChange={(value) => {
              setToAccountId(value);
              clearFieldError("toAccountId");
            }}
            placeholder={referenceData.loading ? "Carregando…" : "Selecione a conta de destino"}
            disabled={isPending || referenceData.loading}
            aria-invalid={Boolean(fieldErrors.toAccountId)}
          />
        </FormField>

        <FormField label="Valor" htmlFor="transfer-amount" required error={fieldErrors.amount}>
          <CurrencyInput
            id="transfer-amount"
            value={amount}
            onValueChange={(value) => {
              setAmount(value);
              clearFieldError("amount");
            }}
            aria-invalid={Boolean(fieldErrors.amount)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Descrição" htmlFor="transfer-description" required error={fieldErrors.description}>
          <Input
            id="transfer-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              clearFieldError("description");
            }}
            aria-invalid={Boolean(fieldErrors.description)}
            disabled={isPending}
          />
        </FormField>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-date">Data</Label>
          <DateField id="transfer-date" value={date} onValueChange={setDate} disabled={isPending} />
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Transferir
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
