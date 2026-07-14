"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createBudgetAction, updateBudgetAction } from "@/modules/budgets/actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { CategoryType } from "@/generated/prisma/enums";
import { notifySuccess } from "@/lib/toast";
import type { BudgetCardData } from "./types";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const MONTH_OPTIONS: EntitySelectOption[] = MONTH_LABELS.map((label, index) => ({
  value: String(index + 1),
  label,
}));

/**
 * Achata a árvore em opções indentadas por profundidade — mesmo padrão de
 * `components/forms/new-transaction-form.tsx` (`flattenCategories`). Não
 * extraído para um shared helper: só a 2ª ocorrência no projeto (rule
 * 02-dry-kiss-yagni: "2 ocorrências = aceitável, observar").
 */
function flattenCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenCategories(node.children, depth + 1),
  ]);
}

type BudgetFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação. Presente = edição (docs/26-BUDGETS.md, "Criação de Orçamento"). */
  budget: BudgetCardData | null;
  /** Mês/ano do período em exibição — default ao criar um orçamento novo. */
  defaultMonth: number;
  defaultYear: number;
};

/**
 * Modal único de criar/editar orçamento (FormModal padrão do handoff):
 * categoria EXPENSE (orçamento só faz sentido pra despesa, docs/26-BUDGETS.md
 * "Regra Principal"), mês, ano, valor planejado. Categorias INCOME nunca
 * aparecem na lista — o backend também rejeita (`BudgetCategoryTypeMismatchError`),
 * mas filtrar aqui evita a viagem de ida e volta pro erro.
 */
export function BudgetFormModal({
  open,
  onOpenChange,
  budget,
  defaultMonth,
  defaultYear,
}: BudgetFormModalProps) {
  const isEditing = budget !== null;

  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [plannedAmount, setPlannedAmount] = useState("0");
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reidrata o formulário sempre que o modal abre — "adjusting state when a
   * prop changes" (react.dev/learn/you-might-not-need-an-effect), feito
   * durante o render (não em `useEffect`), mesmo padrão de
   * `components/accounts/account-form-modal.tsx`.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormError(null);
      setFieldErrors({});
      setCategoryId(budget?.categoryId ?? undefined);
      setMonth(budget?.month ?? defaultMonth);
      setYear(budget?.year ?? defaultYear);
      setPlannedAmount(budget?.plannedAmount ?? "0");
    }
  }

  // Busca a árvore de categorias (Server Action) só quando o modal abre —
  // efeito legítimo: sincroniza com um sistema externo. `setLoadingCategories(true)`
  // fica dentro do `.then()` (não síncrono no corpo do efeito) pra evitar
  // cascading renders, mesmo padrão de `new-transaction-form.tsx`.
  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => {
        setLoadingCategories(true);
        return listCategoryTreeAction();
      })
      .then((result) => {
        if (result.success) setCategories(result.data);
      })
      .finally(() => setLoadingCategories(false));
  }, [open]);

  const categoryOptions = flattenCategories(
    categories.filter((node) => node.type === CategoryType.EXPENSE),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!categoryId) errors.categoryId = "Selecione uma categoria.";
    if (isBlank(plannedAmount)) errors.plannedAmount = "Informe um valor.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = isEditing
        ? await updateBudgetAction(budget.id, { categoryId, month, year, plannedAmount })
        : await createBudgetAction({ categoryId, month, year, plannedAmount });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEditing ? "Orçamento atualizado" : "Orçamento criado");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar orçamento" : "Novo orçamento"}
      description="Defina quanto pode gastar por categoria em um mês — o realizado é sempre calculado a partir das transações."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Categoria" htmlFor="budget-category" required error={fieldErrors.categoryId}>
          <EntitySelect
            id="budget-category"
            options={categoryOptions}
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              clearFieldError("categoryId");
            }}
            placeholder={loadingCategories ? "Carregando…" : "Selecione a categoria"}
            emptyMessage="Nenhuma categoria de despesa cadastrada."
            disabled={isPending || loadingCategories}
            aria-invalid={Boolean(fieldErrors.categoryId)}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-month">Mês</Label>
            <EntitySelect
              id="budget-month"
              options={MONTH_OPTIONS}
              value={String(month)}
              onValueChange={(value) => setMonth(Number(value))}
              placeholder="Mês"
              disabled={isPending}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-year">Ano</Label>
            <EntitySelect
              id="budget-year"
              options={Array.from(new Set([defaultYear - 1, defaultYear, defaultYear + 1, year]))
                .sort()
                .map((option) => ({ value: String(option), label: String(option) }))}
              value={String(year)}
              onValueChange={(value) => setYear(Number(value))}
              placeholder="Ano"
              disabled={isPending}
              className="w-full"
            />
          </div>
        </div>

        <FormField label="Valor planejado" htmlFor="budget-planned-amount" required error={fieldErrors.plannedAmount}>
          <CurrencyInput
            id="budget-planned-amount"
            value={plannedAmount}
            onValueChange={(value) => {
              setPlannedAmount(value);
              clearFieldError("plannedAmount");
            }}
            aria-invalid={Boolean(fieldErrors.plannedAmount)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

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
