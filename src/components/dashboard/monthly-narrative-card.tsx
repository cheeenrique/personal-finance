import { SectionCard } from "./section-card";
import type { MonthlyNarrative } from "@/modules/insights/types";

type MonthlyNarrativeCardProps = {
  narrative: MonthlyNarrative;
};

/**
 * "Resumo do mês" — narrativa factual gerada por IA
 * (`insightsService.monthlyNarrative`), ancorada nos números de caixa do mês
 * corrente. `narrative` é `null` quando a extração falhou (erro-como-dado,
 * ver `modules/insights/narrative.ts`) — nesse caso mostra só um estado vazio
 * discreto, nunca quebra a página.
 */
export function MonthlyNarrativeCard({ narrative }: MonthlyNarrativeCardProps) {
  if (!narrative) {
    return (
      <SectionCard title="Resumo do mês">
        <p className="text-[13px] font-medium text-muted-foreground">Resumo indisponível no momento.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Resumo do mês">
      <div className="space-y-3">
        <p className="text-[13px] font-medium leading-relaxed text-foreground">{narrative.resumo}</p>

        {narrative.destaques.length > 0 && (
          <ul className="space-y-1.5">
            {narrative.destaques.map((destaque, index) => (
              <li key={index} className="flex items-start gap-2 text-[12.5px] font-medium text-muted-foreground">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {destaque}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
