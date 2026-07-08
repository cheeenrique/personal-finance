"use client";

import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";
import { LoanInterestFields, type LoanInterestFieldsValue } from "@/components/loans/loan-interest-fields";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import type { ParsedFinancingInstallment } from "@/modules/telegram/types";

type FinancingCustomSchedulePreviewProps = {
  schedule: ParsedFinancingInstallment[];
  totalToPay: string;
  onTotalToPayChange: (value: string) => void;
  interest: LoanInterestFieldsValue;
  onInterestChange: (value: LoanInterestFieldsValue) => void;
  disabled?: boolean;
};

/**
 * Cronograma CUSTOM importado do documento (Gemini) — lista as N parcelas
 * como vieram (nunca recalculadas, mesma regra de `modules/loans/financing.ts`
 * `buildFinancingSchedule`), + `totalToPay` opcional (schema valida contra a
 * soma do cronograma, ver `createFinancingSchema`) e juros OPCIONAL (só
 * CUSTOM permite isso — PRICE/SAC exigem, ver `FinancingScheduleFields`),
 * reusando `LoanInterestFields` (mesmo componente do form de Empréstimo,
 * genérico o bastante pra qualquer contrato com juros opcional). Extraído de
 * `financing-form-modal.tsx` (rule 05-naming-size.md).
 */
export function FinancingCustomSchedulePreview({
  schedule,
  totalToPay,
  onTotalToPayChange,
  interest,
  onInterestChange,
  disabled,
}: FinancingCustomSchedulePreviewProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border p-3">
      <p className="text-sm font-semibold text-foreground">Cronograma importado — {schedule.length} parcela(s)</p>

      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-muted-foreground">
        {schedule.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <span>
              {index + 1}. {formatDateSaoPaulo(item.dueDate)}
            </span>
            <span className="font-mono">{formatBRL(item.amount)}</span>
          </div>
        ))}
      </div>

      <FormField label="Total a pagar (opcional)" htmlFor="financing-custom-total">
        <CurrencyInput
          id="financing-custom-total"
          value={totalToPay}
          onValueChange={onTotalToPayChange}
          disabled={disabled}
        />
      </FormField>

      <LoanInterestFields value={interest} onChange={onInterestChange} disabled={disabled} />
    </div>
  );
}
