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
import { createInstallmentPurchaseAction } from "@/modules/transactions/actions";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";

type NewInstallmentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceData: TransactionsReferenceData;
  onSaved: () => void;
};

/**
 * Compra parcelada — cria 1 `InstallmentPurchase` + N `Transaction` (uma por
 * parcela) atomicamente via `createInstallmentPurchaseAction`
 * (docs/23-INSTALLMENTS.md, "Fluxo de Criação"). Nunca expõe as N parcelas
 * como formulário separado — o usuário só informa a compra.
 */
export function NewInstallmentModal({ open, onOpenChange, referenceData, onSaved }: NewInstallmentModalProps) {
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [installmentsCount, setInstallmentsCount] = useState("2");
  const [cardId, setCardId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [firstDueDate, setFirstDueDate] = useState(toDateInputValueSaoPaulo());
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reset ao reabrir — "adjusting state when a prop changes"
   * (react.dev/learn/you-might-not-need-an-effect) feito durante o render,
   * mesmo padrão de `InstallmentFormModal`/`NewTransactionForm`. Sem isso,
   * cancelar e reabrir mostrava o rascunho anterior (docs/50-AUDITORIA-BACKLOG.md
   * F11) — antes só `resetForm()` no sucesso do submit cobria esse caminho.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) resetForm();
  }

  const cardOptions = referenceData.originOptions
    .filter((option) => option.group === "Cartões")
    .map((option) => ({ ...option, value: option.value.replace("card:", "") }));
  const expenseCategoryOptions = referenceData.categoryOptions.filter((option) => option.group === "Despesa");

  function resetForm() {
    setDescription("");
    setTotalAmount("");
    setInstallmentsCount("2");
    setCardId(undefined);
    setCategoryId(undefined);
    setFirstDueDate(toDateInputValueSaoPaulo());
    setFieldErrors({});
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(description)) errors.description = "Descrição é obrigatória.";
    if (isBlank(totalAmount)) errors.totalAmount = "Informe um valor.";
    if (isBlank(installmentsCount)) errors.installmentsCount = "Número de parcelas é obrigatório.";
    if (!cardId) errors.cardId = "Selecione o cartão.";
    if (!categoryId) errors.categoryId = "Selecione uma categoria.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = await createInstallmentPurchaseAction({
        cardId,
        description,
        totalAmount,
        installmentsCount: Number(installmentsCount),
        firstDueDate,
        categoryId,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess("Compra parcelada criada");
      resetForm();
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Nova compra parcelada"
      description="Compra parcelada no cartão — as parcelas são criadas automaticamente."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Descrição" htmlFor="installment-description" required error={fieldErrors.description}>
          <Input
            id="installment-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              clearFieldError("description");
            }}
            placeholder="Ex.: MacBook Pro"
            aria-invalid={Boolean(fieldErrors.description)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Valor total" htmlFor="installment-total" required error={fieldErrors.totalAmount}>
          <CurrencyInput
            id="installment-total"
            value={totalAmount}
            onValueChange={(value) => {
              setTotalAmount(value);
              clearFieldError("totalAmount");
            }}
            aria-invalid={Boolean(fieldErrors.totalAmount)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          label="Número de parcelas"
          htmlFor="installment-count"
          required
          error={fieldErrors.installmentsCount}
        >
          <Input
            id="installment-count"
            type="number"
            min={2}
            max={60}
            value={installmentsCount}
            onChange={(event) => {
              setInstallmentsCount(event.target.value);
              clearFieldError("installmentsCount");
            }}
            aria-invalid={Boolean(fieldErrors.installmentsCount)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Cartão" htmlFor="installment-card" required error={fieldErrors.cardId}>
          <EntitySelect
            id="installment-card"
            options={cardOptions}
            value={cardId}
            onValueChange={(value) => {
              setCardId(value);
              clearFieldError("cardId");
            }}
            placeholder={referenceData.loading ? "Carregando…" : "Selecione o cartão"}
            disabled={isPending || referenceData.loading}
            aria-invalid={Boolean(fieldErrors.cardId)}
          />
        </FormField>

        <FormField label="Categoria" htmlFor="installment-category" required error={fieldErrors.categoryId}>
          <EntitySelect
            id="installment-category"
            options={expenseCategoryOptions}
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              clearFieldError("categoryId");
            }}
            placeholder={referenceData.loading ? "Carregando…" : "Selecione a categoria"}
            disabled={isPending || referenceData.loading}
            aria-invalid={Boolean(fieldErrors.categoryId)}
          />
        </FormField>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="installment-first-due">Vencimento da 1ª parcela</Label>
          <DateField id="installment-first-due" value={firstDueDate} onValueChange={setFirstDueDate} disabled={isPending} />
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
            Salvar
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
