"use client";

import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";

export type FinancingBasicFieldsValue = {
  description: string;
  lender: string;
  operationRef: string;
  principal: string;
  accountId: string | undefined;
  downPayment: string;
  assetValue: string;
  assetId: string | undefined;
  categoryId: string | undefined;
};

type FinancingBasicFieldsProps = {
  value: FinancingBasicFieldsValue;
  onChange: (patch: Partial<FinancingBasicFieldsValue>) => void;
  fieldErrors: Record<string, string>;
  clearFieldError: (field: string) => void;
  disabled?: boolean;
  loadingOptions: boolean;
  accountOptions: EntitySelectOption[];
  assetOptions: EntitySelectOption[];
  categoryOptions: EntitySelectOption[];
  /** Entrada/valor do bem/bem financiado/nº da operação só existem na CRIAÇÃO — `updateLoanSchema` não aceita nenhum desses campos (ver JSDoc de `financing-form-modal.tsx`). */
  isEditing: boolean;
};

/**
 * Descrição/credor/operação/valor financiado/conta + entrada/valor do
 * bem/asset/categoria — bloco "identificação + valores" do form de
 * financiamento. Extraído de `financing-form-modal.tsx` (rule
 * 05-naming-size.md, ≤300 linhas — o form principal já reúne bem mais campos
 * que `LoanFormModal`, mesmo racional de `FinancingScheduleFields`/
 * `FinancingCostsFields`).
 */
export function FinancingBasicFields({
  value,
  onChange,
  fieldErrors,
  clearFieldError,
  disabled,
  loadingOptions,
  accountOptions,
  assetOptions,
  categoryOptions,
  isEditing,
}: FinancingBasicFieldsProps) {
  return (
    <>
      <FormField label="Descrição" htmlFor="financing-description" required error={fieldErrors.description}>
        <Input
          id="financing-description"
          value={value.description}
          onChange={(event) => {
            onChange({ description: event.target.value });
            clearFieldError("description");
          }}
          placeholder="Ex.: Financiamento do carro"
          aria-invalid={Boolean(fieldErrors.description)}
          autoFocus
          disabled={disabled}
        />
      </FormField>

      <div className={cn("grid gap-3", isEditing ? "grid-cols-1" : "grid-cols-2")}>
        <FormField label="Credor" htmlFor="financing-lender" error={fieldErrors.lender}>
          <Input
            id="financing-lender"
            value={value.lender}
            onChange={(event) => onChange({ lender: event.target.value })}
            placeholder="Ex.: Banco C6"
            disabled={disabled}
          />
        </FormField>

        {!isEditing && (
          <FormField label="Nº da operação" htmlFor="financing-operation-ref">
            <Input
              id="financing-operation-ref"
              value={value.operationRef}
              onChange={(event) => onChange({ operationRef: event.target.value })}
              placeholder="Opcional"
              disabled={disabled}
            />
          </FormField>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Valor financiado" htmlFor="financing-principal" required error={fieldErrors.principal}>
          <CurrencyInput
            id="financing-principal"
            value={value.principal}
            onValueChange={(next) => {
              onChange({ principal: next });
              clearFieldError("principal");
            }}
            aria-invalid={Boolean(fieldErrors.principal)}
            disabled={disabled}
          />
        </FormField>

        <FormField label="Conta" htmlFor="financing-account" required error={fieldErrors.accountId}>
          <EntitySelect
            id="financing-account"
            options={accountOptions}
            value={value.accountId}
            onValueChange={(next) => {
              onChange({ accountId: next });
              clearFieldError("accountId");
            }}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a conta"}
            disabled={disabled || loadingOptions}
            aria-invalid={Boolean(fieldErrors.accountId)}
          />
        </FormField>
      </div>

      {!isEditing && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Entrada" htmlFor="financing-down-payment">
              <CurrencyInput
                id="financing-down-payment"
                value={value.downPayment}
                onValueChange={(next) => onChange({ downPayment: next })}
                disabled={disabled}
              />
            </FormField>

            <FormField label="Valor do bem" htmlFor="financing-asset-value">
              <CurrencyInput
                id="financing-asset-value"
                value={value.assetValue}
                onValueChange={(next) => onChange({ assetValue: next })}
                disabled={disabled}
              />
            </FormField>
          </div>

          <FormField label="Bem financiado" htmlFor="financing-asset">
            <EntitySelect
              id="financing-asset"
              options={assetOptions}
              value={value.assetId}
              onValueChange={(next) => onChange({ assetId: next })}
              placeholder={loadingOptions ? "Carregando…" : "Vincular a um bem já cadastrado (opcional)"}
              disabled={disabled || loadingOptions}
            />
          </FormField>
        </>
      )}

      <FormField label="Categoria" htmlFor="financing-category" error={fieldErrors.categoryId}>
        <EntitySelect
          id="financing-category"
          options={categoryOptions}
          value={value.categoryId}
          onValueChange={(next) => onChange({ categoryId: next })}
          placeholder={loadingOptions ? "Carregando…" : "Selecione a categoria (opcional)"}
          disabled={disabled || loadingOptions}
        />
      </FormField>
    </>
  );
}
