import type { ReactNode } from "react";

type ReportSectionProps = {
  title: string;
  children: ReactNode;
};

/**
 * Card wrapper genérico pras tabelas de `/reports` ("Por conta", "Por
 * cartão", "Orçamento vs. realizado") — mesma borda/fundo do `ChartWrapper`
 * dos gráficos vizinhos, pra rebalancear a distribuição visual da tela (antes
 * eram `<section>` cru, sem card, ao lado de gráficos com card).
 */
export function ReportSection({ title, children }: ReportSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-extrabold text-foreground">{title}</h3>
      {children}
    </section>
  );
}
