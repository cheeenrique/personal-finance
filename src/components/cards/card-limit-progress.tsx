import { cn } from "@/lib/utils";

type UsageTone = "success" | "warning" | "destructive";

/**
 * Faixa de risco do limite usado (docs/22-CREDIT_CARDS.md, "Exemplo de Card
 * UI"): verde <70%, amarelo 70–90%, vermelho >90%. Limiares não vêm de
 * nenhum doc-fonte (não especificados) — decisão de UX própria desta tela.
 */
function usageTone(percent: number): UsageTone {
  if (percent >= 90) return "destructive";
  if (percent >= 70) return "warning";
  return "success";
}

const BAR_TONE_CLASSES: Record<UsageTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

const TEXT_TONE_CLASSES: Record<UsageTone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

/** `used`/`limit` em string decimal (nunca float) — percentual sempre clampado a [0, 100]. */
export function computeUsagePercent(used: string, limit: string): number {
  const usedValue = Number(used);
  const limitValue = Number(limit);
  if (!Number.isFinite(usedValue) || !Number.isFinite(limitValue) || limitValue <= 0) return 0;
  return Math.min(100, Math.max(0, (usedValue / limitValue) * 100));
}

export function usageToneTextClass(percent: number): string {
  return TEXT_TONE_CLASSES[usageTone(percent)];
}

export function usageToneForKpi(percent: number): "success" | "warning" | "danger" {
  const tone = usageTone(percent);
  return tone === "destructive" ? "danger" : tone;
}

export function CardLimitProgress({ percent, className }: { percent: number; className?: string }) {
  const tone = usageTone(percent);

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", BAR_TONE_CLASSES[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
