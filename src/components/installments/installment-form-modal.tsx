"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
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
import { createInstallmentPurchaseAction } from "@/modules/transactions/actions";
import { listCardOptionsAction } from "@/components/shared/entity-options-actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import { CategoryType } from "@/generated/prisma/enums";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";

type InstallmentFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormState = {
  cardId: string | undefined;
  description: string;
  totalAmount: string;
  installmentsCount: string;
  firstDueDate: string;
  categoryId: string | undefined;
};

function emptyFormState(): FormState {
  return {
    cardId: undefined,
    description: "",
    totalAmount: "",
    installmentsCount: "2",
    firstDueDate: toDateInputValueSaoPaulo(),
    categoryId: undefined,
  };
}

/** Achata a árvore de categorias EXPENSE em opções indentadas — mesmo padrão de `new-transaction-form.tsx`. */
function flattenExpenseCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenExpenseCategories(node.children, depth + 1),
  ]);
}

/**
 * Criação de compra parcelada (docs/23-INSTALLMENTS.md, "Fluxo de Criação"):
 * cartão, descrição, valor total, número de parcelas, 1º vencimento,
 * categoria. `createInstallmentPurchaseAction` cria o `InstallmentPurchase` +
 * as N `Transaction` (parcelas) atomicamente — este formulário só coleta o
 * input, toda a regra de rateio/vencimento vive em `modules/transactions/installments.ts`.
 */
export function InstallmentFormModal({ open, onOpenChange }: InstallmentFormModalProps) {
  const [form, setForm] = useState<FormState>(emptyFormState());
  const [cardOptions, setCardOptions] = useState<EntitySelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<EntitySelectOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reset ao reabrir — "adjusting state when a prop changes"
   * (react.dev/learn/you-might-not-need-an-effect) feito durante o render,
   * mesmo padrão de `CardFormModal`/`NewTransactionForm`.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(emptyFormState());
      setFormError(null);
      setFieldErrors({});
    }
  }

  // Busca cartões/categorias (Server Actions) só quando o modal abre — efeito
  // legítimo: sincroniza com sistema externo. `setState` sempre dentro de um
  // `.then()` (nunca síncrono no corpo do efeito, mesmo padrão de
  // `NewTransactionForm`) — evita `react-hooks/set-state-in-effect`.
  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => {
        setLoadingOptions(true);
        return Promise.all([listCardOptionsAction(), listCategoryTreeAction()]);
      })
      .then(([cardResult, categoryResult]) => {
        setCardOptions(
          cardResult.success ? cardResult.data.map((card) => ({ value: card.id, label: card.name })) : [],
        );
        setCategoryOptions(
          categoryResult.success
            ? flattenExpenseCategories(
                categoryResult.data.filter((node) => node.type === CategoryType.EXPENSE),
              )
            : [],
        );
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const { cardId, categoryId } = form;

    const errors: Record<string, string> = {};
    if (isBlank(form.description)) errors.description = "Descrição é obrigatória.";
    if (isBlank(form.totalAmount)) errors.totalAmount = "Informe um valor.";
    if (isBlank(form.installmentsCount)) errors.installmentsCount = "Número de parcelas é obrigatório.";
    if (!cardId) errors.cardId = "Selecione o cartão.";
    if (!categoryId) errors.categoryId = "Selecione a categoria.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !cardId || !categoryId) return;

    startTransition(async () => {
      const result = await createInstallmentPurchaseAction({
        cardId,
        description: form.description,
        totalAmount: form.totalAmount,
        installmentsCount: Number(form.installmentsCount),
        firstDueDate: form.firstDueDate,
        categoryId,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess("Compra parcelada criada");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Nova compra parcelada"
      description="Compra parcelada no cartão — as parcelas são criadas automaticamente."
      size="tall"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="installment-form" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Salvar
          </Button>
        </>
      }
    >
      <form id="installment-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Descrição" htmlFor="installment-description" required error={fieldErrors.description}>
          <Input
            id="installment-description"
            value={form.description}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, description: event.target.value }));
              clearFieldError("description");
            }}
            placeholder="Ex.: MacBook Pro"
            aria-invalid={Boolean(fieldErrors.description)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField label="Valor total" htmlFor="installment-total" required error={fieldErrors.totalAmount}>
          <CurrencyInput
            id="installment-total"
            value={form.totalAmount}
            onValueChange={(value) => {
              setForm((prev) => ({ ...prev, totalAmount: value }));
              clearFieldError("totalAmount");
            }}
            aria-invalid={Boolean(fieldErrors.totalAmount)}
            disabled={isPending}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label="Nº de parcelas"
            htmlFor="installment-count"
            required
            error={fieldErrors.installmentsCount}
          >
            <Input
              id="installment-count"
              type="number"
              min={2}
              max={60}
              value={form.installmentsCount}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, installmentsCount: event.target.value }));
                clearFieldError("installmentsCount");
              }}
              aria-invalid={Boolean(fieldErrors.installmentsCount)}
              disabled={isPending}
            />
          </FormField>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="installment-first-due">1º vencimento</Label>
            <DateField
              id="installment-first-due"
              value={form.firstDueDate}
              onValueChange={(value) => setForm((prev) => ({ ...prev, firstDueDate: value }))}
              disabled={isPending}
            />
          </div>
        </div>

        <FormField label="Cartão" htmlFor="installment-card" required error={fieldErrors.cardId}>
          <EntitySelect
            id="installment-card"
            options={cardOptions}
            value={form.cardId}
            onValueChange={(value) => {
              setForm((prev) => ({ ...prev, cardId: value }));
              clearFieldError("cardId");
            }}
            placeholder={loadingOptions ? "Carregando…" : "Selecione o cartão"}
            disabled={isPending || loadingOptions}
            aria-invalid={Boolean(fieldErrors.cardId)}
          />
        </FormField>

        <FormField label="Categoria" htmlFor="installment-category" required error={fieldErrors.categoryId}>
          <EntitySelect
            id="installment-category"
            options={categoryOptions}
            value={form.categoryId}
            onValueChange={(value) => {
              setForm((prev) => ({ ...prev, categoryId: value }));
              clearFieldError("categoryId");
            }}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a categoria"}
            disabled={isPending || loadingOptions}
            aria-invalid={Boolean(fieldErrors.categoryId)}
          />
        </FormField>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
      </form>
    </FormModal>
  );
}
