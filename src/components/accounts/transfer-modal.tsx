"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createTransferAction } from "@/modules/accounts/actions";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import type { AccountCardData } from "./types";

type TransferModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountCardData[];
};

/**
 * Transferência entre contas (docs/21-ACCOUNTS.md, "Transferência entre
 * contas"). Origem ≠ destino é validado aqui (UX imediata) e de novo no
 * schema server-side (`transferSchema.refine`) — nunca confiar só no client.
 */
export function TransferModal({ open, onOpenChange, accounts }: TransferModalProps) {
  const [fromAccountId, setFromAccountId] = useState<string | undefined>(undefined);
  const [toAccountId, setToAccountId] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toDateInputValueSaoPaulo());
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  const accountOptions: EntitySelectOption[] = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts],
  );
  const toOptions = accountOptions.filter((option) => option.value !== fromAccountId);

  function resetForm() {
    setFromAccountId(undefined);
    setToAccountId(undefined);
    setAmount("");
    setDescription("");
    setDate(toDateInputValueSaoPaulo());
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetForm();
      setFieldErrors({});
    }
    onOpenChange(next);
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
      const result = await createTransferAction({
        fromAccountId,
        toAccountId,
        amount,
        date,
        description,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess("Transferência realizada");
      resetForm();
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Transferir entre contas"
      description="Move dinheiro entre duas contas suas — não entra em receita nem despesa."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          label="Conta de origem"
          htmlFor="transfer-from-account"
          required
          error={fieldErrors.fromAccountId}
        >
          <EntitySelect
            id="transfer-from-account"
            options={accountOptions}
            value={fromAccountId}
            onValueChange={(value) => {
              setFromAccountId(value);
              if (value === toAccountId) setToAccountId(undefined);
              clearFieldError("fromAccountId");
            }}
            placeholder="Selecione a origem"
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.fromAccountId)}
          />
        </FormField>

        <FormField label="Conta de destino" htmlFor="transfer-to-account" required error={fieldErrors.toAccountId}>
          <EntitySelect
            id="transfer-to-account"
            options={toOptions}
            value={toAccountId}
            onValueChange={(value) => {
              setToAccountId(value);
              clearFieldError("toAccountId");
            }}
            placeholder="Selecione o destino"
            disabled={isPending || !fromAccountId}
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-date">Data</Label>
          <DateField id="transfer-date" value={date} onValueChange={setDate} disabled={isPending} />
        </div>

        <FormField label="Descrição" htmlFor="transfer-description" required error={fieldErrors.description}>
          <Input
            id="transfer-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              clearFieldError("description");
            }}
            placeholder="Ex.: Reserva para viagem"
            aria-invalid={Boolean(fieldErrors.description)}
            disabled={isPending}
          />
        </FormField>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
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
