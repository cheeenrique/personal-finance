"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";

import { FormModal } from "@/components/shared/form-modal";
import { FormModalActions } from "@/components/shared/form-modal-actions";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { contributeToInvestmentAction } from "@/modules/investments/actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import { CategoryType } from "@/generated/prisma/enums";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";
import type { AccountOptionView } from "./types";

const APORTE_CATEGORY_NAME = "Investimento (aporte)";

type ContributeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investmentId: string;
  investmentName: string;
  defaultYieldPercent: string | null;
  accounts: AccountOptionView[];
  onSaved?: () => void;
};

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

/** Modal de aporte — debita conta com teto = saldo (docs/28-INVESTMENTS.md). */
export function ContributeModal({
  open,
  onOpenChange,
  investmentId,
  investmentName,
  defaultYieldPercent,
  accounts,
  onSaved,
}: ContributeModalProps) {
  const [accountId, setAccountId] = useState<string | undefined>();
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [date, setDate] = useState(toDateInputValueSaoPaulo());
  const [yieldOverride, setYieldOverride] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<EntitySelectOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAccountId(undefined);
      setAmount("");
      setDate(toDateInputValueSaoPaulo());
      setYieldOverride("");
      setFormError(null);
      setFieldErrors({});
    }
  }

  const selectedBalance = accounts.find((account) => account.id === accountId)?.balance;
  const accountOptions: EntitySelectOption[] = accounts.map((account) => ({
    value: account.id,
    label: `${account.name} · ${formatBRL(account.balance)}`,
  }));

  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => listCategoryTreeAction())
      .then((result) => {
        if (!result.success) return;
        const expense = result.data.filter((node) => node.type === CategoryType.EXPENSE);
        setCategoryOptions(flattenExpenseCategories(expense));
        const aporteId = findCategoryIdByName(expense, APORTE_CATEGORY_NAME);
        if (aporteId) setCategoryId((prev) => prev ?? aporteId);
      });
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (!accountId) errors.accountId = "Selecione a conta.";
    if (isBlank(amount)) errors.amount = "Informe o valor.";
    if (!categoryId) errors.categoryId = "Selecione a categoria.";
    if (accountId && amount && selectedBalance && Number(amount) > Number(selectedBalance)) {
      errors.amount = `Saldo insuficiente (disponível: ${formatBRL(selectedBalance)}).`;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !accountId || !categoryId) return;

    startTransition(async () => {
      const result = await contributeToInvestmentAction(investmentId, {
        accountId,
        amount,
        categoryId,
        date,
        ...(yieldOverride.trim() ? { yieldPercentOfBenchmark: yieldOverride.trim() } : {}),
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess("Aporte registrado");
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Aportar — ${investmentName}`}
      description="O valor sai do saldo da conta e sobe a posição do investimento."
      footer={
        <FormModalActions
          onCancel={() => onOpenChange(false)}
          submitForm="contribute-form"
          submitLabel="Aportar"
          isPending={isPending}
        />
      }
    >
      <form id="contribute-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Conta" htmlFor="contribute-account" required error={fieldErrors.accountId}>
          <EntitySelect
            id="contribute-account"
            options={accountOptions}
            value={accountId}
            onValueChange={(value) => {
              setAccountId(value);
              clearFieldError("accountId");
            }}
            placeholder="Selecione a conta"
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.accountId)}
          />
        </FormField>

        <FormField label="Valor" htmlFor="contribute-amount" required error={fieldErrors.amount}>
          <CurrencyInput
            id="contribute-amount"
            value={amount}
            onValueChange={(value) => {
              setAmount(value);
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

        <FormField label="Categoria" htmlFor="contribute-category" required error={fieldErrors.categoryId}>
          <EntitySelect
            id="contribute-category"
            options={categoryOptions}
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              clearFieldError("categoryId");
            }}
            placeholder="Selecione a categoria"
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.categoryId)}
          />
        </FormField>

        <FormField label="Data" htmlFor="contribute-date">
          <DateField id="contribute-date" value={date} onValueChange={setDate} disabled={isPending} />
        </FormField>

        <FormField
          label={`% do CDI neste aporte (opcional — default ${defaultYieldPercent ?? "—"}%)`}
          htmlFor="contribute-yield"
        >
          <Input
            id="contribute-yield"
            type="number"
            min={0.01}
            step={0.01}
            value={yieldOverride}
            onChange={(event) => setYieldOverride(event.target.value)}
            placeholder={defaultYieldPercent ?? "115"}
            disabled={isPending}
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
