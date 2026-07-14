"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { createLoanAction, updateLoanAction } from "@/modules/loans/actions";
import { listAccountOptionsAction } from "@/components/shared/entity-options-actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import { CategoryType } from "@/generated/prisma/enums";
import { InterestPeriod } from "@/generated/prisma/enums";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifyError, notifySuccess } from "@/lib/toast";
import { LoanInterestFields } from "./loan-interest-fields";
import type { LoanDetailData } from "./types";

type LoanFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null`/omitido = criação; empréstimo existente = edição (mesmo padrão de `CardFormModal`). */
  loan?: LoanDetailData | null;
  /**
   * Chamado após salvar com sucesso (create OU edit), além de
   * `onOpenChange(false)`. O detalhe (`/loans/[id]`) usa isso pra forçar
   * `router.refresh()` — `revalidateLoanRoutes()` (`modules/loans/actions.ts`)
   * só cobre `/loans` (literal), não o segmento dinâmico `/loans/[id]` (mesmo
   * racional de `handleMarkPaid` em `loan-detail-view.tsx`). `loans-board.tsx`
   * (criação em `/loans`) não precisa passar isso — `revalidatePath("/loans")`
   * já cobre a própria página.
   */
  onSaved?: () => void;
};

type FormState = {
  description: string;
  lender: string;
  principal: string;
  installmentsCount: string;
  installmentAmount: string;
  totalToPay: string;
  /** `true` assim que o usuário edita `totalToPay` diretamente — a partir daí o auto-cálculo (installmentAmount × installmentsCount) para de sobrescrever o campo (ver `computeAutoTotal`). */
  totalToPayTouched: boolean;
  firstDueDate: string;
  accountId: string | undefined;
  categoryId: string | undefined;
  hasInterest: boolean;
  interestRate: string;
  interestPeriod: InterestPeriod;
};

function emptyFormState(): FormState {
  return {
    description: "",
    lender: "",
    principal: "",
    installmentsCount: "1",
    installmentAmount: "",
    totalToPay: "",
    totalToPayTouched: false,
    firstDueDate: toDateInputValueSaoPaulo(),
    accountId: undefined,
    categoryId: undefined,
    hasInterest: false,
    interestRate: "",
    interestPeriod: InterestPeriod.ANNUAL,
  };
}

/** Pré-preenche o form a partir de um empréstimo existente (modo edição). */
function formStateFromLoan(loan: LoanDetailData): FormState {
  return {
    description: loan.description,
    lender: loan.lender ?? "",
    principal: loan.principal,
    installmentsCount: String(loan.installmentsCount),
    installmentAmount: loan.installmentAmount,
    totalToPay: loan.totalToPay,
    // Editando um contrato já existente — o auto-cálculo (installmentAmount ×
    // installmentsCount) nunca deveria sobrescrever um totalToPay que já
    // reflete juros/resíduo reais do contrato salvo.
    totalToPayTouched: true,
    firstDueDate: toDateInputValueSaoPaulo(loan.firstDueDate),
    accountId: loan.accountId,
    categoryId: loan.categoryId ?? undefined,
    hasInterest: Boolean(loan.interestRate),
    // `Number(...)` remove os zeros de padding do `Decimal(9,6)` serializado
    // (ex.: "12.500000" → "12.5") — puramente de apresentação no input.
    interestRate: loan.interestRate ? String(Number(loan.interestRate)) : "",
    interestPeriod: loan.interestPeriod ?? InterestPeriod.ANNUAL,
  };
}

/** Achata a árvore de categorias EXPENSE em opções indentadas — mesmo padrão de `installment-form-modal.tsx`/`new-transaction-form.tsx`. */
function flattenExpenseCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenExpenseCategories(node.children, depth + 1),
  ]);
}

/** Sem acento/case, pra achar "Empréstimos" mesmo se o usuário cadastrou sem acento. */
function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** `installmentAmount × installmentsCount` — sugestão inicial de `totalToPay` (docs do módulo, `schemas.ts`: editável pelo usuário pra cobrir juros/resíduo). Math simples de display, não é o rateio final (esse é recalculado no backend, `installments.ts` `splitLoanInstallmentAmounts`). */
function computeAutoTotal(installmentAmount: string, installmentsCount: string): string {
  const amount = Number(installmentAmount);
  const count = Number(installmentsCount);
  if (!Number.isFinite(amount) || !Number.isFinite(count) || count <= 0 || amount <= 0) return "";
  return (amount * count).toFixed(2);
}

/**
 * Criação/edição de empréstimo (análogo a `InstallmentFormModal`, mas na
 * CONTA e com principal/juros): finalidade, credor, valor emprestado, nº
 * parcelas, valor da parcela, total a pagar (auto-sugerido, editável), 1º
 * vencimento, conta, categoria opcional, juros opcional (`LoanInterestFields`).
 * `loan` presente = edição (mesmo componente pros dois fluxos, mesmo padrão
 * de `CardFormModal`).
 *
 * `createLoanSchema` (`modules/loans/schemas.ts`) NÃO aceita
 * `interestRate`/`interestPeriod` — só `updateLoanSchema` aceita. Criar com
 * juros habilitado grava em 2 passos: `createLoanAction` (contrato base) e,
 * em seguida, `updateLoanAction` só com os campos de juros. Editar sempre
 * usa `updateLoanAction` direto (1 passo, já aceita os campos).
 */
export function LoanFormModal({ open, onOpenChange, loan = null, onSaved }: LoanFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(loan);
  const [form, setForm] = useState<FormState>(() => (loan ? formStateFromLoan(loan) : emptyFormState()));
  const [accountOptions, setAccountOptions] = useState<EntitySelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<EntitySelectOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reset ao abrir (criar ou trocar de empréstimo editado) — "adjusting
   * state when a prop changes" (react.dev/learn/you-might-not-need-an-effect),
   * feito durante o render, mesmo padrão de `CardFormModal`.
   */
  const syncKey = open ? (loan?.id ?? "__new__") : null;
  const [lastSyncKey, setLastSyncKey] = useState<string | null>(syncKey);
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    if (syncKey) {
      setForm(loan ? formStateFromLoan(loan) : emptyFormState());
      setFormError(null);
      setFieldErrors({});
    }
  }

  // Busca contas/categorias (Server Actions) só quando o modal abre — efeito
  // legítimo: sincroniza com sistema externo. `setState` sempre dentro de um
  // `.then()` (nunca síncrono no corpo do efeito), mesmo padrão de
  // `InstallmentFormModal`.
  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => {
        setLoadingOptions(true);
        return Promise.all([listAccountOptionsAction(), listCategoryTreeAction()]);
      })
      .then(([accountResult, categoryResult]) => {
        setAccountOptions(
          accountResult.success ? accountResult.data.map((account) => ({ value: account.id, label: account.name })) : [],
        );

        const expenseOptions = categoryResult.success
          ? flattenExpenseCategories(categoryResult.data.filter((node) => node.type === CategoryType.EXPENSE))
          : [];
        setCategoryOptions(expenseOptions);

        // Default "Empréstimos" se o usuário já tiver essa categoria de
        // despesa E nenhuma categoria já estiver selecionada (não sobrescreve
        // o prefill de edição quando o empréstimo já tem categoria própria).
        const loanCategory = expenseOptions.find((option) => normalizeLabel(option.label) === "emprestimos");
        if (loanCategory) {
          setForm((previous) => (previous.categoryId ? previous : { ...previous, categoryId: loanCategory.value }));
        }
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  function handleInstallmentAmountChange(value: string) {
    setForm((previous) => ({
      ...previous,
      installmentAmount: value,
      totalToPay: previous.totalToPayTouched ? previous.totalToPay : computeAutoTotal(value, previous.installmentsCount),
    }));
    clearFieldError("installmentAmount");
  }

  function handleInstallmentsCountChange(value: string) {
    setForm((previous) => ({
      ...previous,
      installmentsCount: value,
      totalToPay: previous.totalToPayTouched ? previous.totalToPay : computeAutoTotal(previous.installmentAmount, value),
    }));
    clearFieldError("installmentsCount");
  }

  function handleTotalToPayChange(value: string) {
    setForm((previous) => ({ ...previous, totalToPay: value, totalToPayTouched: true }));
    clearFieldError("totalToPay");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const { accountId } = form;

    const errors: Record<string, string> = {};
    if (isBlank(form.description)) errors.description = "Finalidade é obrigatória.";
    if (isBlank(form.principal)) errors.principal = "Informe o valor emprestado.";
    if (isBlank(form.installmentsCount)) errors.installmentsCount = "Número de parcelas é obrigatório.";
    if (isBlank(form.installmentAmount)) errors.installmentAmount = "Informe o valor da parcela.";
    if (isBlank(form.totalToPay)) errors.totalToPay = "Informe o total a pagar.";
    if (!accountId) errors.accountId = "Selecione a conta.";
    if (form.hasInterest && isBlank(form.interestRate)) errors.interestRate = "Informe a taxa de juros.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !accountId) return;

    const interestFields = form.hasInterest
      ? { interestRate: form.interestRate, interestPeriod: form.interestPeriod }
      : { interestRate: null, interestPeriod: null };

    const baseInput = {
      description: form.description,
      principal: form.principal,
      totalToPay: form.totalToPay,
      installmentsCount: Number(form.installmentsCount),
      installmentAmount: form.installmentAmount,
      firstDueDate: form.firstDueDate,
      accountId,
    };

    startTransition(async () => {
      if (isEditing && loan) {
        const result = await updateLoanAction(loan.id, {
          ...baseInput,
          lender: form.lender.trim() || null,
          categoryId: form.categoryId ?? null,
          ...interestFields,
        });

        if (!result.success) {
          setFormError(result.error.message);
          return;
        }

        invalidateAllTransactionLists(queryClient);
        notifySuccess("Empréstimo atualizado");
        onOpenChange(false);
        onSaved?.();
        return;
      }

      const result = await createLoanAction({
        ...baseInput,
        lender: form.lender.trim() || undefined,
        categoryId: form.categoryId,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      // Parcelas nascem como Transaction (docs/03-DATABASE.md, model Loan) —
      // invalida as listagens client-side de transação (podem exibir a conta
      // usada aqui, ex. `/accounts/[id]`), mesmo padrão de
      // `InstallmentFormModal`/`useTransactionMutations`.
      invalidateAllTransactionLists(queryClient);

      // Ver JSDoc do componente: `createLoanSchema` não aceita juros — 2º
      // passo só quando habilitado. Falha aqui NÃO desfaz a criação (o
      // empréstimo já existe); o usuário edita o juros depois pelo mesmo form.
      if (form.hasInterest) {
        const interestResult = await updateLoanAction(result.data.loan.id, interestFields);
        if (!interestResult.success) {
          notifySuccess("Empréstimo criado");
          notifyError(`Os juros não foram salvos: ${interestResult.error.message} Edite o empréstimo pra tentar de novo.`);
          onOpenChange(false);
          onSaved?.();
          return;
        }
      }

      notifySuccess("Empréstimo criado");
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar empréstimo" : "Novo empréstimo"}
      description={
        isEditing
          ? "Parcelas ainda não pagas são recalculadas se o contrato mudar."
          : "As parcelas são criadas automaticamente na conta escolhida."
      }
      size="wide"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Finalidade" htmlFor="loan-description" required error={fieldErrors.description}>
          <Input
            id="loan-description"
            value={form.description}
            onChange={(event) => {
              setForm((previous) => ({ ...previous, description: event.target.value }));
              clearFieldError("description");
            }}
            placeholder="Ex.: Reforma da casa"
            aria-invalid={Boolean(fieldErrors.description)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField label="Credor" htmlFor="loan-lender" error={fieldErrors.lender}>
          <Input
            id="loan-lender"
            value={form.lender}
            onChange={(event) => setForm((previous) => ({ ...previous, lender: event.target.value }))}
            placeholder="Ex.: Banco, familiar…"
            disabled={isPending}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Valor emprestado" htmlFor="loan-principal" required error={fieldErrors.principal}>
            <CurrencyInput
              id="loan-principal"
              value={form.principal}
              onValueChange={(value) => {
                setForm((previous) => ({ ...previous, principal: value }));
                clearFieldError("principal");
              }}
              aria-invalid={Boolean(fieldErrors.principal)}
              disabled={isPending}
            />
          </FormField>

          <FormField label="Nº de parcelas" htmlFor="loan-installments-count" required error={fieldErrors.installmentsCount}>
            <Input
              id="loan-installments-count"
              type="number"
              min={1}
              max={360}
              value={form.installmentsCount}
              onChange={(event) => handleInstallmentsCountChange(event.target.value)}
              aria-invalid={Boolean(fieldErrors.installmentsCount)}
              disabled={isPending}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Valor da parcela" htmlFor="loan-installment-amount" required error={fieldErrors.installmentAmount}>
            <CurrencyInput
              id="loan-installment-amount"
              value={form.installmentAmount}
              onValueChange={handleInstallmentAmountChange}
              aria-invalid={Boolean(fieldErrors.installmentAmount)}
              disabled={isPending}
            />
          </FormField>

          <FormField label="Total a pagar" htmlFor="loan-total-to-pay" required error={fieldErrors.totalToPay}>
            <CurrencyInput
              id="loan-total-to-pay"
              value={form.totalToPay}
              onValueChange={handleTotalToPayChange}
              aria-invalid={Boolean(fieldErrors.totalToPay)}
              disabled={isPending}
            />
          </FormField>
        </div>

        <FormField label="1º vencimento" htmlFor="loan-first-due">
          <DateField
            id="loan-first-due"
            value={form.firstDueDate}
            onValueChange={(value) => setForm((previous) => ({ ...previous, firstDueDate: value }))}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Conta" htmlFor="loan-account" required error={fieldErrors.accountId}>
          <EntitySelect
            id="loan-account"
            options={accountOptions}
            value={form.accountId}
            onValueChange={(value) => {
              setForm((previous) => ({ ...previous, accountId: value }));
              clearFieldError("accountId");
            }}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a conta"}
            disabled={isPending || loadingOptions}
            aria-invalid={Boolean(fieldErrors.accountId)}
          />
        </FormField>

        <FormField label="Categoria" htmlFor="loan-category" error={fieldErrors.categoryId}>
          <EntitySelect
            id="loan-category"
            options={categoryOptions}
            value={form.categoryId}
            onValueChange={(value) => setForm((previous) => ({ ...previous, categoryId: value }))}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a categoria (opcional)"}
            disabled={isPending || loadingOptions}
          />
        </FormField>

        <LoanInterestFields
          value={{ hasInterest: form.hasInterest, interestRate: form.interestRate, interestPeriod: form.interestPeriod }}
          onChange={(next) => {
            setForm((previous) => ({ ...previous, ...next }));
            clearFieldError("interestRate");
          }}
          error={fieldErrors.interestRate}
          disabled={isPending}
        />

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
