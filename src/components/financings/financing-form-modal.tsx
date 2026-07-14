"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { FormModal } from "@/components/shared/form-modal";
import { FormModalActions } from "@/components/shared/form-modal-actions";
import { type EntitySelectOption } from "@/components/forms/entity-select";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createFinancingAction, updateLoanAction } from "@/modules/loans/actions";
import { listAccountOptionsAction, listAssetOptionsAction } from "@/components/shared/entity-options-actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import { CategoryType } from "@/generated/prisma/enums";
import { AmortizationSystem, InterestPeriod } from "@/generated/prisma/enums";
import type { CategoryTreeNode } from "@/modules/categories/types";
import type { ParsedFinancing, ParsedFinancingInstallment } from "@/modules/telegram/types";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import { FinancingImportButton } from "./financing-import-button";
import { FinancingBasicFields } from "./financing-basic-fields";
import { FinancingScheduleFields } from "./financing-schedule-fields";
import { FinancingCostsFields } from "./financing-costs-fields";
import { FinancingCustomSchedulePreview } from "./financing-custom-schedule-preview";
import { FinancingContractSummary } from "./financing-contract-summary";
import type { FinancingDetailData } from "./types";

type FinancingFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null`/omitido = criação; financiamento existente = edição. */
  financing?: FinancingDetailData | null;
  /** Chamado após salvar com sucesso — `createFinancingAction`/`updateLoanAction` chamam `revalidateLoanRoutes()` (`modules/loans/action-helpers.ts`), que NÃO conhece `/financings` (não podemos tocar `modules/*`) — o caller sempre precisa de um `router.refresh()` explícito aqui. */
  onSaved?: () => void;
};

type FormState = {
  description: string;
  lender: string;
  operationRef: string;
  principal: string;
  downPayment: string;
  assetValue: string;
  assetId: string | undefined;
  accountId: string | undefined;
  categoryId: string | undefined;
  amortizationSystem: AmortizationSystem;
  installmentsCount: string;
  installmentAmount: string;
  totalToPay: string;
  totalToPayTouched: boolean;
  firstDueDate: string;
  interestRate: string;
  interestPeriod: InterestPeriod;
  cet: string;
  financedTaxes: string;
  financedInsurance: string;
  financedFees: string;
  /** Cronograma explícito vindo de um documento importado com tabela de parcelas (Gemini) — presente = sistema travado em CUSTOM, `installmentsCount`/`installmentAmount`/`totalToPay`/`firstDueDate` deixam de ser inputs (docs da tarefa, item 5). */
  customSchedule: ParsedFinancingInstallment[] | null;
  hasCustomInterest: boolean;
};

function emptyFormState(): FormState {
  return {
    description: "",
    lender: "",
    operationRef: "",
    principal: "",
    downPayment: "",
    assetValue: "",
    assetId: undefined,
    accountId: undefined,
    categoryId: undefined,
    amortizationSystem: AmortizationSystem.PRICE,
    installmentsCount: "1",
    installmentAmount: "",
    totalToPay: "",
    totalToPayTouched: false,
    firstDueDate: toDateInputValueSaoPaulo(),
    interestRate: "",
    interestPeriod: InterestPeriod.ANNUAL,
    cet: "",
    financedTaxes: "",
    financedInsurance: "",
    financedFees: "",
    customSchedule: null,
    hasCustomInterest: false,
  };
}

/** Pré-preenche o form a partir de um financiamento existente (modo edição) — só os campos que `updateLoanAction` sabe editar viram input; o resto aparece só em `FinancingContractSummary` (leitura). */
function formStateFromFinancing(financing: FinancingDetailData): FormState {
  return {
    ...emptyFormState(),
    description: financing.description,
    lender: financing.lender ?? "",
    principal: financing.principal,
    accountId: financing.accountId,
    categoryId: financing.categoryId ?? undefined,
    amortizationSystem: financing.amortizationSystem,
    installmentsCount: String(financing.installmentsCount),
    installmentAmount: financing.installmentAmount,
    totalToPay: financing.totalToPay,
    totalToPayTouched: true,
    firstDueDate: toDateInputValueSaoPaulo(financing.firstDueDate),
    interestRate: financing.interestRate ? String(Number(financing.interestRate)) : "",
    interestPeriod: financing.interestPeriod ?? InterestPeriod.ANNUAL,
  };
}

/** `installmentAmount × installmentsCount` — sugestão inicial de `totalToPay` (PRICE), mesmo cálculo de `loan-form-modal.tsx` `computeAutoTotal` (2ª ocorrência, rule 02-dry-kiss-yagni: aceitável, sem extrair ainda). */
function computeAutoTotal(installmentAmount: string, installmentsCount: string): string {
  const amount = Number(installmentAmount);
  const count = Number(installmentsCount);
  if (!Number.isFinite(amount) || !Number.isFinite(count) || count <= 0 || amount <= 0) return "";
  return (amount * count).toFixed(2);
}

/** Achata a árvore de categorias EXPENSE em opções indentadas — mesmo padrão de `loan-form-modal.tsx`. */
function flattenExpenseCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenExpenseCategories(node.children, depth + 1),
  ]);
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Criação/edição de financiamento (`Loan.kind=FINANCING`) — análogo a
 * `LoanFormModal`, mas com os campos exclusivos do contrato (entrada, valor
 * do bem, sistema Price/SAC/Custom, CET, custos embutidos) + import de
 * documento (Gemini). `financing` presente = edição.
 *
 * EDIÇÃO é mais restrita que criação: `updateLoanSchema`
 * (`modules/loans/schemas.ts`) não aceita nenhum campo exclusivo de
 * financiamento (entrada/valor do bem/asset/CET/custos/sistema) — só os
 * campos base de `Loan` (mesmo subconjunto de `LoanFormModal`). Esses campos
 * aparecem em modo edição só como leitura (`FinancingContractSummary`), nunca
 * como input, pra não sugerir uma edição que o backend silenciosamente
 * ignora. Além disso, `installmentsCount`/`installmentAmount`/`totalToPay`/
 * `firstDueDate` ficam BLOQUEADOS ao editar um SAC/CUSTOM (ver JSDoc de
 * `FinancingScheduleFields`) — só PRICE permite editar o cronograma, mesmo
 * comportamento de `LoanFormModal`.
 *
 * CUSTOM só existe via import de documento com tabela de parcelas — não há
 * seletor manual pra ele (`createFinancingSchema`, discriminated union PRICE/
 * SAC/CUSTOM: CUSTOM exige `schedule`, que só o parser do Gemini preenche
 * aqui; digitar N parcelas manualmente uma a uma no form não é um fluxo real
 * do produto, YAGNI).
 */
export function FinancingFormModal({ open, onOpenChange, financing = null, onSaved }: FinancingFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(financing);
  const [form, setForm] = useState<FormState>(() => (financing ? formStateFromFinancing(financing) : emptyFormState()));
  const [accountOptions, setAccountOptions] = useState<EntitySelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<EntitySelectOption[]>([]);
  const [assetOptions, setAssetOptions] = useState<EntitySelectOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /** Reset ao abrir (criar ou trocar de financiamento editado) — "adjusting state when a prop changes", mesmo padrão de `LoanFormModal`. */
  const syncKey = open ? (financing?.id ?? "__new__") : null;
  const [lastSyncKey, setLastSyncKey] = useState<string | null>(syncKey);
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    if (syncKey) {
      setForm(financing ? formStateFromFinancing(financing) : emptyFormState());
      setFormError(null);
      setFieldErrors({});
    }
  }

  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => {
        setLoadingOptions(true);
        return Promise.all([listAccountOptionsAction(), listCategoryTreeAction(), listAssetOptionsAction()]);
      })
      .then(([accountResult, categoryResult, assetResult]) => {
        setAccountOptions(
          accountResult.success ? accountResult.data.map((account) => ({ value: account.id, label: account.name })) : [],
        );
        setAssetOptions(assetResult.success ? assetResult.data.map((asset) => ({ value: asset.id, label: asset.name })) : []);

        const expenseOptions = categoryResult.success
          ? flattenExpenseCategories(categoryResult.data.filter((node) => node.type === CategoryType.EXPENSE))
          : [];
        setCategoryOptions(expenseOptions);

        const financingCategory = expenseOptions.find((option) => normalizeLabel(option.label) === "financiamentos");
        if (financingCategory) {
          setForm((previous) => (previous.categoryId ? previous : { ...previous, categoryId: financingCategory.value }));
        }
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  function handleParsed(parsed: ParsedFinancing): void {
    const hasCustomSchedule = Boolean(parsed.installments && parsed.installments.length > 0);

    setForm((previous) => ({
      ...previous,
      description: parsed.description ?? previous.description,
      lender: parsed.lender ?? previous.lender,
      operationRef: parsed.operationRef ?? previous.operationRef,
      principal: parsed.principal ?? previous.principal,
      downPayment: parsed.downPayment ?? previous.downPayment,
      assetValue: parsed.assetValue ?? previous.assetValue,
      installmentsCount: parsed.installmentsCount ? String(parsed.installmentsCount) : previous.installmentsCount,
      installmentAmount: parsed.installmentAmount ?? previous.installmentAmount,
      totalToPay: parsed.totalToPay ?? previous.totalToPay,
      totalToPayTouched: Boolean(parsed.totalToPay) || previous.totalToPayTouched,
      firstDueDate: parsed.firstDueDate ?? previous.firstDueDate,
      interestRate: parsed.interestRate ?? previous.interestRate,
      interestPeriod: (parsed.interestPeriod as InterestPeriod | null) ?? previous.interestPeriod,
      hasCustomInterest: hasCustomSchedule ? Boolean(parsed.interestRate) : previous.hasCustomInterest,
      cet: parsed.cet ?? previous.cet,
      financedTaxes: parsed.financedTaxes ?? previous.financedTaxes,
      financedInsurance: parsed.financedInsurance ?? previous.financedInsurance,
      financedFees: parsed.financedFees ?? previous.financedFees,
      // Tabela de parcelas no documento → CUSTOM, cronograma usado como veio
      // (nunca recalculado, mesma regra de `modules/loans/financing.ts`
      // `buildFinancingSchedule`) — prevalece mesmo se o Gemini classificou
      // como "SAC" (`amortizationSystem`), porque só CUSTOM preserva os
      // valores exatos da tabela extraída.
      customSchedule: hasCustomSchedule ? parsed.installments : previous.customSchedule,
      amortizationSystem: hasCustomSchedule
        ? previous.amortizationSystem
        : parsed.amortizationSystem === "SAC"
          ? AmortizationSystem.SAC
          : AmortizationSystem.PRICE,
    }));

    notifySuccess("Documento lido — revise os campos antes de salvar");
  }

  const scheduleFieldsLocked = isEditing && form.amortizationSystem !== AmortizationSystem.PRICE;

  function validateBase(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (isBlank(form.description)) errors.description = "Descrição é obrigatória.";
    if (isBlank(form.principal)) errors.principal = "Informe o valor financiado.";
    if (!form.accountId) errors.accountId = "Selecione a conta.";

    if (!form.customSchedule) {
      if (isBlank(form.installmentsCount)) errors.installmentsCount = "Número de parcelas é obrigatório.";
      if (isBlank(form.interestRate)) errors.interestRate = "Informe a taxa de juros.";
      if (form.amortizationSystem === AmortizationSystem.PRICE) {
        if (isBlank(form.installmentAmount)) errors.installmentAmount = "Informe o valor da parcela.";
        if (isBlank(form.totalToPay)) errors.totalToPay = "Informe o total a pagar.";
      }
    }

    return errors;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors = validateBase();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !form.accountId) return;

    const accountId = form.accountId;

    startTransition(async () => {
      if (isEditing && financing) {
        const result = await updateLoanAction(financing.id, {
          description: form.description,
          lender: form.lender.trim() || null,
          principal: form.principal,
          accountId,
          categoryId: form.categoryId ?? null,
          interestRate: form.interestRate || null,
          interestPeriod: form.interestRate ? form.interestPeriod : null,
          ...(scheduleFieldsLocked
            ? {}
            : {
                totalToPay: form.totalToPay,
                installmentsCount: Number(form.installmentsCount),
                installmentAmount: form.installmentAmount,
                firstDueDate: form.firstDueDate,
              }),
        });

        if (!result.success) {
          setFormError(result.error.message);
          return;
        }

        invalidateAllTransactionLists(queryClient);
        notifySuccess("Financiamento atualizado");
        onOpenChange(false);
        onSaved?.();
        return;
      }

      const commonFields = {
        description: form.description,
        lender: form.lender.trim() || undefined,
        accountId,
        categoryId: form.categoryId,
        principal: form.principal,
        assetId: form.assetId,
        downPayment: form.downPayment || undefined,
        assetValue: form.assetValue || undefined,
        cet: form.cet || undefined,
        operationRef: form.operationRef.trim() || undefined,
        financedTaxes: form.financedTaxes || undefined,
        financedInsurance: form.financedInsurance || undefined,
        financedFees: form.financedFees || undefined,
      };

      const payload = form.customSchedule
        ? {
            ...commonFields,
            amortizationSystem: AmortizationSystem.CUSTOM,
            totalToPay: form.totalToPay || undefined,
            interestRate: form.hasCustomInterest ? form.interestRate : undefined,
            interestPeriod: form.hasCustomInterest ? form.interestPeriod : undefined,
            schedule: form.customSchedule,
          }
        : form.amortizationSystem === AmortizationSystem.SAC
          ? {
              ...commonFields,
              amortizationSystem: AmortizationSystem.SAC,
              installmentsCount: Number(form.installmentsCount),
              firstDueDate: form.firstDueDate,
              interestRate: form.interestRate,
              interestPeriod: form.interestPeriod,
            }
          : {
              ...commonFields,
              amortizationSystem: AmortizationSystem.PRICE,
              totalToPay: form.totalToPay,
              installmentsCount: Number(form.installmentsCount),
              installmentAmount: form.installmentAmount,
              firstDueDate: form.firstDueDate,
              interestRate: form.interestRate,
              interestPeriod: form.interestPeriod,
            };

      const result = await createFinancingAction(payload);

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      invalidateAllTransactionLists(queryClient);
      notifySuccess("Financiamento criado");
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar financiamento" : "Novo financiamento"}
      description={
        isEditing
          ? "Entrada, valor do bem e demais dados do contrato não podem ser editados aqui."
          : "As parcelas são criadas automaticamente na conta escolhida."
      }
      size="tall"
      footer={
        <FormModalActions
          onCancel={() => onOpenChange(false)}
          submitForm="financing-form"
          submitLabel="Salvar"
          isPending={isPending}
        />
      }
    >
      <form id="financing-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!isEditing && <FinancingImportButton onParsed={handleParsed} disabled={isPending} />}

        <FinancingBasicFields
          value={{
            description: form.description,
            lender: form.lender,
            operationRef: form.operationRef,
            principal: form.principal,
            accountId: form.accountId,
            downPayment: form.downPayment,
            assetValue: form.assetValue,
            assetId: form.assetId,
            categoryId: form.categoryId,
          }}
          onChange={(patch) => setForm((previous) => ({ ...previous, ...patch }))}
          fieldErrors={fieldErrors}
          clearFieldError={clearFieldError}
          disabled={isPending}
          loadingOptions={loadingOptions}
          accountOptions={accountOptions}
          assetOptions={assetOptions}
          categoryOptions={categoryOptions}
          isEditing={isEditing}
        />

        {form.customSchedule ? (
          <FinancingCustomSchedulePreview
            schedule={form.customSchedule}
            totalToPay={form.totalToPay}
            onTotalToPayChange={(value) =>
              setForm((previous) => ({ ...previous, totalToPay: value, totalToPayTouched: true }))
            }
            interest={{ hasInterest: form.hasCustomInterest, interestRate: form.interestRate, interestPeriod: form.interestPeriod }}
            onInterestChange={(next) =>
              setForm((previous) => ({
                ...previous,
                hasCustomInterest: next.hasInterest,
                interestRate: next.interestRate,
                interestPeriod: next.interestPeriod,
              }))
            }
            disabled={isPending}
          />
        ) : (
          <FinancingScheduleFields
            value={{
              amortizationSystem: form.amortizationSystem,
              installmentsCount: form.installmentsCount,
              installmentAmount: form.installmentAmount,
              totalToPay: form.totalToPay,
              firstDueDate: form.firstDueDate,
              interestRate: form.interestRate,
              interestPeriod: form.interestPeriod,
            }}
            onChange={(patch) => {
              setForm((previous) => {
                const next = { ...previous, ...patch };
                if (
                  !previous.totalToPayTouched &&
                  (patch.installmentAmount !== undefined || patch.installmentsCount !== undefined)
                ) {
                  next.totalToPay = computeAutoTotal(next.installmentAmount, next.installmentsCount);
                }
                if (patch.totalToPay !== undefined) next.totalToPayTouched = true;
                return next;
              });
            }}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
            disabled={isPending}
            systemEditable={!isEditing}
            scheduleFieldsLocked={scheduleFieldsLocked}
          />
        )}

        {!isEditing && (
          <FinancingCostsFields
            value={{
              cet: form.cet,
              financedTaxes: form.financedTaxes,
              financedInsurance: form.financedInsurance,
              financedFees: form.financedFees,
            }}
            onChange={(patch) => setForm((previous) => ({ ...previous, ...patch }))}
            disabled={isPending}
          />
        )}

        {isEditing && financing && (
          <div className="rounded-[10px] border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-bold text-muted-foreground uppercase tracking-[0.05em]">
              Dados do contrato (somente leitura)
            </p>
            <FinancingContractSummary
              fields={{
                amortizationSystem: financing.amortizationSystem,
                downPayment: financing.downPayment,
                assetValue: financing.assetValue,
                assetId: financing.assetId,
                assetName: financing.assetName,
                cet: financing.cet,
                operationRef: financing.operationRef,
                financedTaxes: financing.financedTaxes,
                financedInsurance: financing.financedInsurance,
                financedFees: financing.financedFees,
              }}
            />
          </div>
        )}

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
      </form>
    </FormModal>
  );
}
