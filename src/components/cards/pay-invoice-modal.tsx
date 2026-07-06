"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { formatBRL } from "@/lib/money/format";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import { payInvoiceForClient, listPayerAccountsForClient } from "./ui-actions";

type PayInvoiceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  cardName: string;
  /** Saldo devedor do cartão (decimal string) — teto do pagamento (docs/22, Regra 1: "cartão nunca pode ter saldo positivo"). */
  outstandingBalance: string;
};

/** Pagamento de fatura (docs/22-CREDIT_CARDS.md, "Pagamento da fatura"). */
export function PayInvoiceModal({ open, onOpenChange, cardId, cardName, outstandingBalance }: PayInvoiceModalProps) {
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toDateInputValueSaoPaulo());
  const [description, setDescription] = useState("");
  const [accountOptions, setAccountOptions] = useState<EntitySelectOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  // Reset ao reabrir — mesmo padrão de NewTransactionForm (sync durante o render, não em efeito).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAccountId(undefined);
      setAmount("");
      setDate(toDateInputValueSaoPaulo());
      setDescription("");
      setFormError(null);
      setFieldErrors({});
    }
  }

  // Busca contas pagadoras (Server Action) só quando o modal abre — efeito
  // legítimo: sincroniza com sistema externo. `setLoadingAccounts(true)`
  // dentro do `.then()` (não síncrono no corpo do efeito) evita cascading
  // renders, mesmo padrão de `NewTransactionForm`.
  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => {
        setLoadingAccounts(true);
        return listPayerAccountsForClient();
      })
      .then((result) => {
        if (result.success) {
          setAccountOptions(result.data.map((account) => ({ value: account.id, label: account.name })));
        }
      })
      .finally(() => setLoadingAccounts(false));
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!accountId) errors.accountId = "Selecione a conta pagadora.";
    if (isBlank(amount)) errors.amount = "Informe um valor.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (Number(amount) > Number(outstandingBalance)) {
      setFormError(`O valor não pode ser maior que o saldo devedor (${formatBRL(outstandingBalance)}).`);
      return;
    }

    startTransition(async () => {
      const result = await payInvoiceForClient({
        cardId,
        accountId,
        amount,
        date,
        description: description.trim() || undefined,
      });

      if (!result.success) {
        setFormError(
          result.error.code === "PAYMENT_EXCEEDS_BALANCE"
            ? `O valor não pode ser maior que o saldo devedor (${formatBRL(outstandingBalance)}).`
            : result.error.message,
        );
        return;
      }

      notifySuccess("Fatura paga");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Pagar fatura"
      description={`Abate o saldo devedor de ${cardName}.`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Conta pagadora" htmlFor="pay-account" required error={fieldErrors.accountId}>
          <EntitySelect
            id="pay-account"
            options={accountOptions}
            value={accountId}
            onValueChange={(value) => {
              setAccountId(value);
              clearFieldError("accountId");
            }}
            placeholder={loadingAccounts ? "Carregando…" : "Selecione a conta"}
            disabled={isPending || loadingAccounts}
            aria-invalid={Boolean(fieldErrors.accountId)}
          />
        </FormField>

        <FormField label="Valor" htmlFor="pay-amount" required error={fieldErrors.amount}>
          <CurrencyInput
            id="pay-amount"
            value={amount}
            onValueChange={(value) => {
              setAmount(value);
              clearFieldError("amount");
            }}
            aria-invalid={Boolean(fieldErrors.amount)}
            autoFocus
            disabled={isPending}
          />
          <p className="text-xs font-medium text-muted-foreground">
            Saldo devedor: {formatBRL(outstandingBalance)}
          </p>
        </FormField>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-date">Data</Label>
          <DateField id="pay-date" value={date} onValueChange={setDate} disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-description">Descrição (opcional)</Label>
          <Input
            id="pay-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={`Pagamento fatura ${cardName}`}
            disabled={isPending}
          />
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
          <Button type="submit" disabled={isPending || Number(outstandingBalance) <= 0}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Pagar fatura
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
