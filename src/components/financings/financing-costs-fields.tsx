"use client";

import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";

export type FinancingCostsValue = {
  cet: string;
  financedTaxes: string;
  financedInsurance: string;
  financedFees: string;
};

type FinancingCostsFieldsProps = {
  value: FinancingCostsValue;
  onChange: (patch: Partial<FinancingCostsValue>) => void;
  disabled?: boolean;
};

/**
 * CET + composição de custos embutidos (IOF/seguro/tarifas) — bloco
 * puramente informativo do contrato de financiamento (`modules/loans/
 * schemas.ts`, `financingCommonFields`: nenhum desses soma de novo em cima
 * do `principal`, só detalha). Extraído de `financing-form-modal.tsx` (rule
 * 05-naming-size.md, ≤300 linhas — o form principal já reúne bem mais campos
 * que `LoanFormModal`). Só aparece na CRIAÇÃO — `updateLoanSchema` não
 * aceita nenhum desses campos (ver JSDoc do form principal), edição mostra
 * o mesmo dado só como leitura via `FinancingContractSummary`.
 */
export function FinancingCostsFields({ value, onChange, disabled }: FinancingCostsFieldsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
      <p className="text-sm font-semibold text-foreground">Custos embutidos (opcional)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="CET (% a.m.)" htmlFor="financing-cet">
          <Input
            id="financing-cet"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={value.cet}
            onChange={(event) => onChange({ cet: event.target.value })}
            placeholder="Opcional"
            disabled={disabled}
          />
        </FormField>

        <FormField label="IOF financiado" htmlFor="financing-taxes">
          <CurrencyInput
            id="financing-taxes"
            value={value.financedTaxes}
            onValueChange={(next) => onChange({ financedTaxes: next })}
            disabled={disabled}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Seguro financiado" htmlFor="financing-insurance">
          <CurrencyInput
            id="financing-insurance"
            value={value.financedInsurance}
            onValueChange={(next) => onChange({ financedInsurance: next })}
            disabled={disabled}
          />
        </FormField>

        <FormField label="Tarifas financiadas" htmlFor="financing-fees">
          <CurrencyInput
            id="financing-fees"
            value={value.financedFees}
            onValueChange={(next) => onChange({ financedFees: next })}
            disabled={disabled}
          />
        </FormField>
      </div>
    </div>
  );
}
