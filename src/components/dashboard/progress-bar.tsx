import { cn } from "@/lib/utils";

type ProgressBarProps = {
  /** 0-100+, já calculado pelo caller (nunca recalcula % aqui — só desenha). */
  percent: number;
  label: string;
  tone?: "neutral" | "warning" | "danger" | "accent";
  className?: string;
};

const TONE_CLASSES: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  neutral: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
  accent: "bg-accent",
};

/**
 * Barra de progresso horizontal simples — limite usado (Cartões) e parcelas
 * pagas (Parcelamentos), ambos no Dashboard (docs/11-DASHBOARD.md). Só
 * desenho: quem chama decide o `percent` e o `tone` (limite >100% = "danger",
 * ver `cards-summary.tsx`).
 */
export function ProgressBar({ percent, label, tone = "neutral", className }: ProgressBarProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className={cn("h-full rounded-full transition-all", TONE_CLASSES[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-[11.5px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
