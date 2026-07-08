"use client";

import { useState, useTransition } from "react";
import { Loader2, TrendingDown } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { simulateAmortizationAction, executeAmortizationAction } from "@/modules/loans/amortization-actions";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo, toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import type { ClientLoanAmortizationSimulation } from "@/modules/loans/types";

type Order = "next" | "last";

const ORDER_OPTIONS: { value: Order; label: string }[] = [
  { value: "next", label: "A partir da próxima parcela" },
  { value: "last", label: "A partir da última parcela" },
];

type FinancingSimulateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  /** Nº de parcelas ainda não pagas — teto do dropdown "Quantidade" (reavaliado no servidor, nunca confiado cegamente, ver `modules/loans/simulate.ts` `assertCountInRange`). */
  unpaidCount: number;
  /** Vencimento da próxima parcela não paga (ISO) — só exibição ("Próximo vencimento: X"); o limite real de `paymentDate` é validado no servidor. */
  nextDueDate: string;
  onConfirmed: () => void;
};

/**
 * Simulador de antecipação de parcelas (modelo C6 "Antecipar parcelas",
 * docs da tarefa item 4) — 2 passos no MESMO modal (nunca telas separadas,
 * docs/05-UX_RULES.md): parâmetros → "Simular" (`simulateAmortizationAction`,
 * só CALCULA) → revisa o resultado → "Antecipar" (`executeAmortizationAction`,
 * GRAVA os mesmos parâmetros). "Quitar tudo" (`type=full`) já é coberto pelo
 * botão "Quitar" separado do header (`SettleLoanDialog`, reusado como está,
 * docs da tarefa: "pode ser no mesmo modal ou o settle-loan-dialog
 * existente") — este modal foca só no modo "advance" (parcial), evitando
 * duplicar a mesma lógica de quitação em 2 componentes.
 */
export function FinancingSimulateModal({
  open,
  onOpenChange,
  loanId,
  unpaidCount,
  nextDueDate,
  onConfirmed,
}: FinancingSimulateModalProps) {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<Order>("next");
  const [count, setCount] = useState("1");
  const [paymentDate, setPaymentDate] = useState(toDateInputValueSaoPaulo());
  const [simulation, setSimulation] = useState<ClientLoanAmortizationSimulation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSimulating, startSimulating] = useTransition();
  const [isConfirming, startConfirming] = useTransition();

  // Reset ao abrir — "adjusting state when a prop changes"
  // (react.dev/learn/you-might-not-need-an-effect), feito durante o render,
  // mesmo padrão de `LoanFormModal`/`FinancingFormModal` (`syncKey`) — nunca
  // `setState` síncrono dentro de um `useEffect` (regra `react-hooks/set-state-in-effect`
  // deste projeto).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOrder("next");
      setCount("1");
      setPaymentDate(toDateInputValueSaoPaulo());
      setSimulation(null);
      setError(null);
    }
  }

  const countOptions: EntitySelectOption[] = Array.from({ length: Math.max(unpaidCount, 1) }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1} parcela${index === 0 ? "" : "s"}`,
  }));

  function handleSimulate() {
    setError(null);
    startSimulating(async () => {
      const result = await simulateAmortizationAction(loanId, {
        type: "advance",
        order,
        count: Number(count),
        paymentDate,
      });

      if (!result.success) {
        setError(result.error.message);
        setSimulation(null);
        return;
      }

      setSimulation(result.data);
    });
  }

  function handleConfirm() {
    setError(null);
    startConfirming(async () => {
      const result = await executeAmortizationAction(loanId, {
        type: "advance",
        order,
        count: Number(count),
        paymentDate,
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      invalidateAllTransactionLists(queryClient);
      notifySuccess(`Antecipação confirmada — total pago: ${formatBRL(result.data)}`);
      onConfirmed();
      onOpenChange(false);
    });
  }

  const isPending = isSimulating || isConfirming;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simular antecipação</DialogTitle>
          <DialogDescription>Os valores valem só pra data da consulta.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <FormField label="Data do pagamento" htmlFor="financing-simulate-date">
            <DateField
              id="financing-simulate-date"
              value={paymentDate}
              onValueChange={(value) => {
                setPaymentDate(value);
                setSimulation(null);
              }}
              disabled={isPending}
            />
          </FormField>
          <p className="-mt-2 text-[11.5px] font-medium text-muted-foreground">
            Próximo vencimento: {formatDateSaoPaulo(nextDueDate)}
          </p>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-foreground">Ordem</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ORDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setOrder(option.value);
                    setSimulation(null);
                  }}
                  aria-pressed={order === option.value}
                  disabled={isPending}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-[10px] border px-2 text-center text-xs font-bold transition-colors",
                    order === option.value ? "border-primary bg-primary/16 text-primary" : "border-border text-muted-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <FormField label="Quantidade de parcelas" htmlFor="financing-simulate-count">
            <EntitySelect
              id="financing-simulate-count"
              options={countOptions}
              value={count}
              onValueChange={(value) => {
                setCount(value);
                setSimulation(null);
              }}
              disabled={isPending}
            />
          </FormField>

          <Button type="button" variant="neutral" size="lg" onClick={handleSimulate} disabled={isPending}>
            {isSimulating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Simular
          </Button>

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          {simulation && (
            <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11.5px] font-semibold text-muted-foreground">Parcelas</p>
                  <p className="font-mono font-semibold text-foreground">
                    {simulation.installments.count} (nº {simulation.installments.numbers[0]}–
                    {simulation.installments.numbers[simulation.installments.numbers.length - 1]})
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] font-semibold text-muted-foreground">Desconto de juros</p>
                  <p className="inline-flex items-center gap-1 font-mono font-semibold text-on-success">
                    <TrendingDown className="size-3.5" aria-hidden="true" />
                    {formatBRL(simulation.interestDiscount)}
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] font-semibold text-muted-foreground">Total a pagar hoje</p>
                  <p className="font-mono font-semibold text-foreground">{formatBRL(simulation.totalToPayToday)}</p>
                </div>
                <div>
                  <p className="text-[11.5px] font-semibold text-muted-foreground">Período</p>
                  <p className="font-mono font-semibold text-foreground">
                    {formatDateSaoPaulo(simulation.period.start)} → {formatDateSaoPaulo(simulation.period.end)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                <div>
                  <p className="mb-1 font-bold text-muted-foreground uppercase tracking-[0.05em]">Antes</p>
                  <p className="font-mono text-foreground">Saldo: {formatBRL(simulation.before.nominal)}</p>
                  <p className="font-mono text-foreground">Parcelas: {simulation.before.installmentsCount}</p>
                  <p className="font-mono text-foreground">
                    Fim: {simulation.before.endDate ? formatDateSaoPaulo(simulation.before.endDate) : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-bold text-muted-foreground uppercase tracking-[0.05em]">Depois</p>
                  <p className="font-mono text-foreground">Saldo: {formatBRL(simulation.after.nominal)}</p>
                  <p className="font-mono text-foreground">Parcelas: {simulation.after.installmentsCount}</p>
                  <p className="font-mono text-foreground">
                    Fim: {simulation.after.endDate ? formatDateSaoPaulo(simulation.after.endDate) : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="accent" onClick={handleConfirm} disabled={isPending || !simulation}>
            {isConfirming && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Antecipar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
