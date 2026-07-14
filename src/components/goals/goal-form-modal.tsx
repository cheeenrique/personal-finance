"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createGoalAction, updateGoalAction } from "@/modules/goals/actions";
import { GoalSourceType } from "@/generated/prisma/enums";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import type { GoalCardData } from "./types";

const SOURCE_TYPE_OPTIONS: EntitySelectOption[] = [
  { value: GoalSourceType.MANUAL, label: "Manual" },
  { value: GoalSourceType.ACCOUNT, label: "Conta" },
  { value: GoalSourceType.ASSET, label: "Ativo (Patrimônio)" },
];

type GoalFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação. Presente = edição. */
  goal: GoalCardData | null;
  accountOptions: EntitySelectOption[];
  assetOptions: EntitySelectOption[];
};

/**
 * Modal único de criar/editar meta (FormModal padrão do handoff), mesmo
 * esqueleto de `components/budgets/budget-form-modal.tsx`. `sourceType`
 * decide quais campos aparecem: conta/ativo de origem só fazem sentido com o
 * tipo correspondente, valor já guardado (manual) só existe para `MANUAL` —
 * mesma regra reforçada no backend (`modules/goals/schemas.ts`
 * `assertSourceConsistency`, `modules/goals/service.ts` `assertValidSource`).
 */
export function GoalFormModal({ open, onOpenChange, goal, accountOptions, assetOptions }: GoalFormModalProps) {
  const isEditing = goal !== null;

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("0");
  const [hasTargetDate, setHasTargetDate] = useState(false);
  const [targetDate, setTargetDate] = useState(toDateInputValueSaoPaulo());
  const [sourceType, setSourceType] = useState<GoalSourceType>(GoalSourceType.MANUAL);
  const [sourceAccountId, setSourceAccountId] = useState<string | undefined>(undefined);
  const [sourceAssetId, setSourceAssetId] = useState<string | undefined>(undefined);
  const [currentAmount, setCurrentAmount] = useState("0");
  const [monthlyContribution, setMonthlyContribution] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reidrata o formulário sempre que o modal abre — "adjusting state when a
   * prop changes" (react.dev/learn/you-might-not-need-an-effect), feito
   * durante o render (não em `useEffect`), mesmo padrão de
   * `components/budgets/budget-form-modal.tsx`.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormError(null);
      setFieldErrors({});
      setName(goal?.name ?? "");
      setTargetAmount(goal?.targetAmount ?? "0");
      setHasTargetDate(Boolean(goal?.targetDate));
      setTargetDate(goal?.targetDate ?? toDateInputValueSaoPaulo());
      setSourceType(goal?.sourceType ?? GoalSourceType.MANUAL);
      setSourceAccountId(goal?.sourceAccountId ?? undefined);
      setSourceAssetId(goal?.sourceAssetId ?? undefined);
      setCurrentAmount(goal?.currentAmount ?? "0");
      setMonthlyContribution(goal?.monthlyContribution ?? "0");
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(name)) errors.name = "Nome é obrigatório.";
    if (isBlank(targetAmount) || Number(targetAmount) <= 0) errors.targetAmount = "Informe um valor.";
    if (sourceType === GoalSourceType.ACCOUNT && !sourceAccountId) {
      errors.sourceAccountId = "Selecione a conta de origem.";
    }
    if (sourceType === GoalSourceType.ASSET && !sourceAssetId) {
      errors.sourceAssetId = "Selecione o ativo de origem.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // "0" (default do CurrencyInput) equivale a "não informado" — nem toda
    // meta tem aporte mensal fixo (o backend deriva do ritmo de caixa quando
    // ausente, `modules/goals/service.ts` `trailingMonthlyRate`).
    const hasMonthlyContribution = Number(monthlyContribution) > 0;

    startTransition(async () => {
      const result = isEditing
        ? await updateGoalAction(goal.id, {
            name,
            targetAmount,
            targetDate: hasTargetDate ? targetDate : null,
            sourceType,
            sourceAccountId: sourceType === GoalSourceType.ACCOUNT ? sourceAccountId : null,
            sourceAssetId: sourceType === GoalSourceType.ASSET ? sourceAssetId : null,
            currentAmount: sourceType === GoalSourceType.MANUAL ? currentAmount : undefined,
            monthlyContribution: hasMonthlyContribution ? monthlyContribution : null,
          })
        : await createGoalAction({
            name,
            targetAmount,
            targetDate: hasTargetDate ? targetDate : undefined,
            sourceType,
            sourceAccountId: sourceType === GoalSourceType.ACCOUNT ? sourceAccountId : undefined,
            sourceAssetId: sourceType === GoalSourceType.ASSET ? sourceAssetId : undefined,
            currentAmount: sourceType === GoalSourceType.MANUAL ? currentAmount : undefined,
            monthlyContribution: hasMonthlyContribution ? monthlyContribution : undefined,
          });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEditing ? "Meta atualizada" : "Meta criada");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar meta" : "Nova meta"}
      description="Defina quanto quer guardar — o progresso é sempre calculado a partir da origem escolhida."
      size="tall"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="goal-form" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Salvar
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Nome" htmlFor="goal-name" required error={fieldErrors.name}>
          <Input
            id="goal-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
            placeholder="Ex.: Reserva de emergência, Viagem…"
            aria-invalid={Boolean(fieldErrors.name)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField label="Valor alvo" htmlFor="goal-target-amount" required error={fieldErrors.targetAmount}>
          <CurrencyInput
            id="goal-target-amount"
            value={targetAmount}
            onValueChange={(value) => {
              setTargetAmount(value);
              clearFieldError("targetAmount");
            }}
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.targetAmount)}
          />
        </FormField>

        <FormField label="Origem" htmlFor="goal-source-type" required>
          <EntitySelect
            id="goal-source-type"
            options={SOURCE_TYPE_OPTIONS}
            value={sourceType}
            onValueChange={(value) => {
              setSourceType(value as GoalSourceType);
              setSourceAccountId(undefined);
              setSourceAssetId(undefined);
              clearFieldError("sourceAccountId");
              clearFieldError("sourceAssetId");
            }}
            disabled={isPending}
            className="w-full"
          />
        </FormField>

        {sourceType === GoalSourceType.ACCOUNT && (
          <FormField
            label="Conta de origem"
            htmlFor="goal-source-account"
            required
            error={fieldErrors.sourceAccountId}
          >
            <EntitySelect
              id="goal-source-account"
              options={accountOptions}
              value={sourceAccountId}
              onValueChange={(value) => {
                setSourceAccountId(value);
                clearFieldError("sourceAccountId");
              }}
              placeholder="Selecione a conta"
              emptyMessage="Nenhuma conta cadastrada."
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.sourceAccountId)}
            />
          </FormField>
        )}

        {sourceType === GoalSourceType.ASSET && (
          <FormField label="Ativo de origem" htmlFor="goal-source-asset" required error={fieldErrors.sourceAssetId}>
            <EntitySelect
              id="goal-source-asset"
              options={assetOptions}
              value={sourceAssetId}
              onValueChange={(value) => {
                setSourceAssetId(value);
                clearFieldError("sourceAssetId");
              }}
              placeholder="Selecione o ativo"
              emptyMessage="Nenhum ativo cadastrado."
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.sourceAssetId)}
            />
          </FormField>
        )}

        {sourceType === GoalSourceType.MANUAL && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-current-amount">Valor já guardado</Label>
            <CurrencyInput
              id="goal-current-amount"
              value={currentAmount}
              onValueChange={setCurrentAmount}
              disabled={isPending}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-monthly-contribution">Aporte mensal (opcional)</Label>
          <CurrencyInput
            id="goal-monthly-contribution"
            value={monthlyContribution}
            onValueChange={setMonthlyContribution}
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Data alvo (opcional)</Label>
          {hasTargetDate ? (
            <div className="flex items-center gap-2">
              <DateField
                id="goal-target-date"
                value={targetDate}
                onValueChange={setTargetDate}
                disabled={isPending}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setHasTargetDate(false)}
                disabled={isPending}
                aria-label="Remover data alvo"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setHasTargetDate(true)}
              disabled={isPending}
              className="w-fit"
            >
              <Plus className="size-4" aria-hidden="true" />
              Definir data alvo
            </Button>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
      </form>
    </FormModal>
  );
}
