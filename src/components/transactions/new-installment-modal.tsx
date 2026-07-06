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
  const [isPending, startTransition] = useTransition();

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
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!cardId) {
      setFormError("Selecione o cartão.");
      return;
    }
    if (!categoryId) {
      setFormError("Selecione uma categoria.");
      return;
    }

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
      description="Cria a compra e todas as parcelas de uma vez."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="installment-description">Descrição</Label>
          <Input
            id="installment-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: MacBook Pro"
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="installment-total">Valor total</Label>
          <CurrencyInput id="installment-total" value={totalAmount} onValueChange={setTotalAmount} required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="installment-count">Número de parcelas</Label>
          <Input
            id="installment-count"
            type="number"
            min={2}
            max={60}
            value={installmentsCount}
            onChange={(event) => setInstallmentsCount(event.target.value)}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cartão</Label>
          <EntitySelect
            options={cardOptions}
            value={cardId}
            onValueChange={setCardId}
            placeholder={referenceData.loading ? "Carregando…" : "Selecione o cartão"}
            disabled={isPending || referenceData.loading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Categoria</Label>
          <EntitySelect
            options={expenseCategoryOptions}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder={referenceData.loading ? "Carregando…" : "Selecione a categoria"}
            disabled={isPending || referenceData.loading}
          />
        </div>

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
            Criar
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
