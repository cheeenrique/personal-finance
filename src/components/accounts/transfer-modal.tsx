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
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!fromAccountId || !toAccountId) {
      setFormError("Selecione a conta de origem e a de destino.");
      return;
    }
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
        <div className="flex flex-col gap-1.5">
          <Label>Conta de origem</Label>
          <EntitySelect
            options={accountOptions}
            value={fromAccountId}
            onValueChange={(value) => {
              setFromAccountId(value);
              if (value === toAccountId) setToAccountId(undefined);
            }}
            placeholder="Selecione a origem"
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Conta de destino</Label>
          <EntitySelect
            options={toOptions}
            value={toAccountId}
            onValueChange={setToAccountId}
            placeholder="Selecione o destino"
            disabled={isPending || !fromAccountId}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-amount">Valor</Label>
          <CurrencyInput
            id="transfer-amount"
            value={amount}
            onValueChange={setAmount}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-date">Data</Label>
          <DateField id="transfer-date" value={date} onValueChange={setDate} disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-description">Descrição</Label>
          <Input
            id="transfer-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Reserva para viagem"
            required
            disabled={isPending}
          />
        </div>

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
