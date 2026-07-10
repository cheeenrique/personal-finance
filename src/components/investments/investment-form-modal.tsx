"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createInvestmentAction, updateInvestmentAction } from "@/modules/investments/actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import { CategoryType } from "@/generated/prisma/enums";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";
import type { AccountOptionView } from "./types";

const APORTE_CATEGORY_NAME = "Investimento (aporte)";

type InvestmentFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOptionView[];
  onSaved?: () => void;
  /** Presente = modo edição (só nome + % CDI; sem aporte). Ausente = criação. */
  investment?: { id: string; name: string; yieldPercentOfBenchmark: string | null };
};

type FormState = {
  name: string;
  yieldPercentOfBenchmark: string;
  withContribution: boolean;
  accountId: string | undefined;
  amount: string;
  categoryId: string | undefined;
  date: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    yieldPercentOfBenchmark: "115",
    withContribution: true,
    accountId: undefined,
    amount: "",
    categoryId: undefined,
    date: toDateInputValueSaoPaulo(),
  };
}

function findCategoryIdByName(nodes: CategoryTreeNode[], name: string): string | undefined {
  for (const node of nodes) {
    if (node.name === name) return node.id;
    const child = findCategoryIdByName(node.children, name);
    if (child) return child;
  }
  return undefined;
}

function flattenExpenseCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenExpenseCategories(node.children, depth + 1),
  ]);
}

/**
 * Criação de investimento (docs/28-INVESTMENTS.md): nome + % CDI + aporte
 * inicial opcional (conta, valor ≤ saldo, categoria aporte).
 */
export function InvestmentFormModal({
  open,
  onOpenChange,
  accounts,
  onSaved,
  investment,
}: InvestmentFormModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [categoryOptions, setCategoryOptions] = useState<EntitySelectOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(investment);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(
        investment
          ? {
              ...emptyForm(),
              name: investment.name,
              yieldPercentOfBenchmark: investment.yieldPercentOfBenchmark ?? "",
              withContribution: false,
            }
          : emptyForm(),
      );
      setFormError(null);
      setFieldErrors({});
    }
  }

  const accountOptions: EntitySelectOption[] = accounts.map((account) => ({
    value: account.id,
    label: `${account.name} · ${formatBRL(account.balance)}`,
  }));

  const selectedBalance = accounts.find((account) => account.id === form.accountId)?.balance;

  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => {
        setLoadingCategories(true);
        return listCategoryTreeAction();
      })
      .then((result) => {
        if (!result.success) {
          setCategoryOptions([]);
          return;
        }
        const expense = result.data.filter((node) => node.type === CategoryType.EXPENSE);
        setCategoryOptions(flattenExpenseCategories(expense));
        const aporteId = findCategoryIdByName(expense, APORTE_CATEGORY_NAME);
        if (aporteId) {
          setForm((prev) => (prev.categoryId ? prev : { ...prev, categoryId: aporteId }));
        }
      })
      .finally(() => setLoadingCategories(false));
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(form.name)) errors.name = "Nome é obrigatório.";
    if (isBlank(form.yieldPercentOfBenchmark)) errors.yieldPercentOfBenchmark = "Informe o % do CDI.";

    if (!isEdit && form.withContribution) {
      if (!form.accountId) errors.accountId = "Selecione a conta.";
      if (isBlank(form.amount)) errors.amount = "Informe o valor do aporte.";
      if (!form.categoryId) errors.categoryId = "Selecione a categoria.";
      if (form.accountId && form.amount && selectedBalance && Number(form.amount) > Number(selectedBalance)) {
        errors.amount = `Saldo insuficiente (disponível: ${formatBRL(selectedBalance)}).`;
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = isEdit
        ? await updateInvestmentAction(investment!.id, {
            name: form.name,
            yieldPercentOfBenchmark: form.yieldPercentOfBenchmark,
          })
        : await createInvestmentAction({
            name: form.name,
            yieldPercentOfBenchmark: form.yieldPercentOfBenchmark,
            ...(form.withContribution && form.accountId && form.categoryId
              ? {
                  initialContribution: {
                    accountId: form.accountId,
                    amount: form.amount,
                    categoryId: form.categoryId,
                    date: form.date,
                  },
                }
              : {}),
          });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEdit ? "Investimento atualizado" : "Investimento criado");
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar investimento" : "Novo investimento"}
      description={
        isEdit
          ? "Atualize o nome e o % do CDI deste investimento."
          : "Produto com % do CDI. O aporte inicial debita o saldo da conta escolhida."
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Nome" htmlFor="investment-name" required error={fieldErrors.name}>
          <Input
            id="investment-name"
            value={form.name}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, name: event.target.value }));
              clearFieldError("name");
            }}
            placeholder="Ex.: Cofrinho Nubank"
            autoFocus
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.name)}
          />
        </FormField>

        <FormField
          label="% do CDI"
          htmlFor="investment-yield"
          required
          error={fieldErrors.yieldPercentOfBenchmark}
        >
          <Input
            id="investment-yield"
            type="number"
            min={0.01}
            step={0.01}
            value={form.yieldPercentOfBenchmark}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, yieldPercentOfBenchmark: event.target.value }));
              clearFieldError("yieldPercentOfBenchmark");
            }}
            placeholder="115"
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.yieldPercentOfBenchmark)}
          />
        </FormField>

        {!isEdit && (
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              checked={form.withContribution}
              onChange={(event) => setForm((prev) => ({ ...prev, withContribution: event.target.checked }))}
              disabled={isPending}
              className="size-4 rounded border-border"
            />
            Aportar agora (debita a conta)
          </label>
        )}

        {!isEdit && form.withContribution && (
          <>
            <FormField label="Conta" htmlFor="investment-account" required error={fieldErrors.accountId}>
              <EntitySelect
                id="investment-account"
                options={accountOptions}
                value={form.accountId}
                onValueChange={(value) => {
                  setForm((prev) => ({ ...prev, accountId: value }));
                  clearFieldError("accountId");
                }}
                placeholder="Selecione a conta"
                disabled={isPending || accounts.length === 0}
                aria-invalid={Boolean(fieldErrors.accountId)}
              />
            </FormField>

            <FormField label="Valor do aporte" htmlFor="investment-amount" required error={fieldErrors.amount}>
              <CurrencyInput
                id="investment-amount"
                value={form.amount}
                onValueChange={(value) => {
                  setForm((prev) => ({ ...prev, amount: value }));
                  clearFieldError("amount");
                }}
                disabled={isPending}
                aria-invalid={Boolean(fieldErrors.amount)}
              />
              {selectedBalance && (
                <p className="text-[11.5px] font-semibold text-muted-foreground">
                  Disponível: {formatBRL(selectedBalance)}
                </p>
              )}
            </FormField>

            <FormField label="Categoria" htmlFor="investment-category" required error={fieldErrors.categoryId}>
              <EntitySelect
                id="investment-category"
                options={categoryOptions}
                value={form.categoryId}
                onValueChange={(value) => {
                  setForm((prev) => ({ ...prev, categoryId: value }));
                  clearFieldError("categoryId");
                }}
                placeholder={loadingCategories ? "Carregando…" : "Selecione a categoria"}
                disabled={isPending || loadingCategories}
                aria-invalid={Boolean(fieldErrors.categoryId)}
              />
            </FormField>

            <FormField label="Data" htmlFor="investment-date">
              <DateField
                id="investment-date"
                value={form.date}
                onValueChange={(value) => setForm((prev) => ({ ...prev, date: value }))}
                disabled={isPending}
              />
            </FormField>
          </>
        )}

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
            {isEdit ? "Salvar" : "Criar"}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
