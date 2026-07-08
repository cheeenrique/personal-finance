"use client";

import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { AmortizationSystem, InterestPeriod } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const SYSTEM_OPTIONS: { value: AmortizationSystem; label: string }[] = [
  { value: AmortizationSystem.PRICE, label: "Price (parcelas fixas)" },
  { value: AmortizationSystem.SAC, label: "SAC (decrescente)" },
];

const INTEREST_PERIOD_OPTIONS: EntitySelectOption[] = [
  { value: InterestPeriod.ANNUAL, label: "Ao ano" },
  { value: InterestPeriod.MONTHLY, label: "Ao mês" },
];

export type FinancingScheduleValue = {
  amortizationSystem: AmortizationSystem;
  installmentsCount: string;
  installmentAmount: string;
  totalToPay: string;
  firstDueDate: string;
  interestRate: string;
  interestPeriod: InterestPeriod;
};

type FinancingScheduleFieldsProps = {
  value: FinancingScheduleValue;
  onChange: (patch: Partial<FinancingScheduleValue>) => void;
  fieldErrors: Record<string, string>;
  clearFieldError: (field: string) => void;
  disabled?: boolean;
  /** `true` só na CRIAÇÃO — sistema (Price/SAC) é imutável depois (`updateLoanSchema` não aceita `amortizationSystem`, ver JSDoc de `financing-form-modal.tsx`). */
  systemEditable: boolean;
  /**
   * Nº de parcelas/valor da parcela/total/1º vencimento ficam BLOQUEADOS ao
   * editar um financiamento SAC/CUSTOM — `updateLoan`
   * (`modules/loans/update.ts`) regenera o cronograma não pago com a mesma
   * lógica de parcela FIXA de um `Loan` comum (`regenerateUnpaidInstallments`,
   * PRICE-style), o que corromperia o cronograma decrescente de um SAC (ou
   * o cronograma explícito de um CUSTOM) se esses campos fossem editados
   * por aqui. PRICE não tem esse problema — o cronograma editado já É
   * PRICE-style, então o form deixa editar normalmente (mesmo comportamento
   * de `LoanFormModal`).
   */
  scheduleFieldsLocked: boolean;
};

/**
 * Bloco "Sistema + cronograma + juros" do form de financiamento — extraído
 * de `financing-form-modal.tsx` (rule 05-naming-size.md, ≤300 linhas: o
 * form principal já reúne bem mais campos que `LoanFormModal`). Sistema
 * (Price/SAC — CUSTOM só entra via import de documento, tratado à parte no
 * form principal) decide quais campos de cronograma fazem sentido: SAC
 * deriva `installmentAmount`/`totalToPay` do `principal`+taxa (nunca inputs
 * do usuário, `modules/loans/schemas.ts` `sacFinancingSchema`), Price pede
 * os dois.
 */
export function FinancingScheduleFields({
  value,
  onChange,
  fieldErrors,
  clearFieldError,
  disabled,
  systemEditable,
  scheduleFieldsLocked,
}: FinancingScheduleFieldsProps) {
  const isPrice = value.amortizationSystem === AmortizationSystem.PRICE;

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
      {systemEditable ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-foreground">Sistema de amortização</p>
          <div className="grid grid-cols-2 gap-2">
            {SYSTEM_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange({ amortizationSystem: option.value })}
                aria-pressed={value.amortizationSystem === option.value}
                disabled={disabled}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-[10px] border px-2 text-sm font-bold transition-colors",
                  value.amortizationSystem === option.value
                    ? "border-primary bg-primary/16 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs font-semibold text-muted-foreground">
          Sistema: {SYSTEM_OPTIONS.find((option) => option.value === value.amortizationSystem)?.label ?? value.amortizationSystem}{" "}
          (não pode ser alterado depois de criado)
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Nº de parcelas" htmlFor="financing-installments-count" required error={fieldErrors.installmentsCount}>
          <Input
            id="financing-installments-count"
            type="number"
            min={1}
            max={360}
            value={value.installmentsCount}
            onChange={(event) => {
              onChange({ installmentsCount: event.target.value });
              clearFieldError("installmentsCount");
            }}
            aria-invalid={Boolean(fieldErrors.installmentsCount)}
            disabled={disabled || scheduleFieldsLocked}
          />
        </FormField>

        <FormField label="1º vencimento" htmlFor="financing-first-due">
          <DateField
            id="financing-first-due"
            value={value.firstDueDate}
            onValueChange={(next) => onChange({ firstDueDate: next })}
            disabled={disabled || scheduleFieldsLocked}
          />
        </FormField>
      </div>

      {isPrice && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Valor da parcela" htmlFor="financing-installment-amount" required error={fieldErrors.installmentAmount}>
            <CurrencyInput
              id="financing-installment-amount"
              value={value.installmentAmount}
              onValueChange={(next) => {
                onChange({ installmentAmount: next });
                clearFieldError("installmentAmount");
              }}
              aria-invalid={Boolean(fieldErrors.installmentAmount)}
              disabled={disabled || scheduleFieldsLocked}
            />
          </FormField>

          <FormField label="Total a pagar" htmlFor="financing-total-to-pay" required error={fieldErrors.totalToPay}>
            <CurrencyInput
              id="financing-total-to-pay"
              value={value.totalToPay}
              onValueChange={(next) => {
                onChange({ totalToPay: next });
                clearFieldError("totalToPay");
              }}
              aria-invalid={Boolean(fieldErrors.totalToPay)}
              disabled={disabled || scheduleFieldsLocked}
            />
          </FormField>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Taxa de juros (%)" htmlFor="financing-interest-rate" required error={fieldErrors.interestRate}>
          <Input
            id="financing-interest-rate"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={value.interestRate}
            onChange={(event) => {
              onChange({ interestRate: event.target.value });
              clearFieldError("interestRate");
            }}
            aria-invalid={Boolean(fieldErrors.interestRate)}
            disabled={disabled}
          />
        </FormField>

        <FormField label="Período" htmlFor="financing-interest-period">
          <EntitySelect
            id="financing-interest-period"
            options={INTEREST_PERIOD_OPTIONS}
            value={value.interestPeriod}
            onValueChange={(next) => onChange({ interestPeriod: next as InterestPeriod })}
            disabled={disabled}
          />
        </FormField>
      </div>
    </div>
  );
}
