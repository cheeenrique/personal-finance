"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { InterestPeriod } from "@/generated/prisma/enums";

const INTEREST_PERIOD_OPTIONS: EntitySelectOption[] = [
  { value: InterestPeriod.ANNUAL, label: "Ao ano" },
  { value: InterestPeriod.MONTHLY, label: "Ao mês" },
];

export type LoanInterestFieldsValue = {
  hasInterest: boolean;
  interestRate: string;
  interestPeriod: InterestPeriod;
};

type LoanInterestFieldsProps = {
  value: LoanInterestFieldsValue;
  onChange: (value: LoanInterestFieldsValue) => void;
  error?: string | null;
  disabled?: boolean;
};

/**
 * Bloco "Tem juros?" do form de empréstimo (create E edit, docs da tarefa
 * "Seção de juros") — default DESLIGADO (decisão do dono;
 * `modules/loans/schemas.ts` `updateLoanSchema`: `interestRate`/
 * `interestPeriod` nulos = sem juros configurado). Habilitar liga o cálculo
 * de desconto na antecipação (`modules/loans/interest.ts`).
 *
 * Extraído do `LoanFormModal` pra manter o arquivo principal dentro do guia
 * de tamanho (~/.claude/rules/05-naming-size.md, ≤300 linhas) — bloco
 * autocontido (toggle + 2 campos condicionais), sem estado próprio, só
 * repassa a mudança pro form pai (mesmo padrão de composição de
 * `FormField`/`DateField`).
 */
export function LoanInterestFields({ value, onChange, error, disabled }: LoanInterestFieldsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="loan-has-interest">Tem juros?</Label>
          <p className="text-[12px] font-medium text-muted-foreground">
            Habilita cálculo de desconto na antecipação.
          </p>
        </div>
        <Switch
          id="loan-has-interest"
          checked={value.hasInterest}
          onCheckedChange={(hasInterest) => onChange({ ...value, hasInterest })}
          disabled={disabled}
        />
      </div>

      {value.hasInterest && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Taxa de juros (%)" htmlFor="loan-interest-rate" required error={error}>
            <Input
              id="loan-interest-rate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={value.interestRate}
              onChange={(event) => onChange({ ...value, interestRate: event.target.value })}
              aria-invalid={Boolean(error)}
              disabled={disabled}
            />
          </FormField>

          <FormField label="Período" htmlFor="loan-interest-period">
            <EntitySelect
              id="loan-interest-period"
              options={INTEREST_PERIOD_OPTIONS}
              value={value.interestPeriod}
              onValueChange={(period) => onChange({ ...value, interestPeriod: period as InterestPeriod })}
              disabled={disabled}
            />
          </FormField>
        </div>
      )}
    </div>
  );
}
