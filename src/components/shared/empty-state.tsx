import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

/**
 * Usado em toda lista/tela sem dados (docs/06-SCREENS.md, "EmptyState").
 * Ícone tint + título + descrição + CTA laranja (ação de criar) que já leva
 * à criação do primeiro item daquela entidade.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-10 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-[11px] bg-accent/16">
        <Icon className="size-6 text-accent" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-extrabold text-foreground">{title}</p>
        {description && (
          <p className="max-w-xs text-[13px] font-medium text-muted-foreground">{description}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <Button type="button" variant="accent" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
