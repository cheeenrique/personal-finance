"use client";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";

type HealthScoreHelpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type MetricExplanation = {
  title: string;
  weight: string;
  description: string;
};

const METRICS: readonly MetricExplanation[] = [
  {
    title: "Taxa de poupança",
    weight: "peso 40%",
    description:
      "Sobra do mês ÷ receita do mês. 0% de sobra vale 0 pontos, 20% de sobra ou mais vale 100 pontos.",
  },
  {
    title: "Comprometimento com dívida",
    weight: "peso 30%",
    description:
      "(Parcelas de empréstimo/financiamento do mês + fatura atual dos cartões de crédito) ÷ receita. Quanto menor, melhor: 50% ou mais do income comprometido vale 0 pontos, 10% ou menos vale 100 pontos.",
  },
  {
    title: "Meses de reserva",
    weight: "peso 30%",
    description:
      "Reserva de emergência ÷ gasto médio mensal dos últimos 3 meses. 0 meses de colchão vale 0 pontos, 6 meses ou mais vale 100 pontos.",
  },
] as const;

/**
 * Explica como o score de "Saúde financeira" (`modules/insights/score.ts`,
 * `healthScore`) é calculado: média ponderada de 3 métricas (0.4/0.3/0.3) +
 * faixas de nota final. Mesmo padrão de `TelegramHelpModal` — `FormModal`
 * reaproveitado como conteúdo explicativo, não formulário.
 */
export function HealthScoreHelpModal({ open, onOpenChange }: HealthScoreHelpModalProps) {
  return (
    <FormModal open={open} onOpenChange={onOpenChange} title="Como calculamos a Saúde financeira">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] font-medium text-muted-foreground">
          O score vai de 0 a 100 e é a média ponderada de 3 métricas independentes.
        </p>

        <ul className="flex flex-col gap-3">
          {METRICS.map((metric) => (
            <li key={metric.title} className="rounded-lg bg-secondary/60 p-3">
              <p className="text-[13px] font-bold text-foreground">
                {metric.title} <span className="font-normal text-muted-foreground">({metric.weight})</span>
              </p>
              <p className="mt-1 text-[13px] font-medium text-muted-foreground">{metric.description}</p>
            </li>
          ))}
        </ul>

        <p className="text-[13px] font-medium text-muted-foreground">
          Nota final = média ponderada das 3 métricas. Faixas: <strong className="text-on-success">70 ou mais</strong>{" "}
          é saudável, <strong className="text-on-warning">entre 40 e 69</strong> é atenção, e{" "}
          <strong className="text-on-danger">abaixo de 40</strong> é crítico.
        </p>

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Entendi
          </Button>
        </div>
      </div>
    </FormModal>
  );
}
