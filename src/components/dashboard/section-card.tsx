import Link from "next/link";
import type { ReactNode } from "react";

import { CARD_SHADOW_CLASS, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type SectionCardProps = {
  title: string;
  /** Elemento renderizado logo após o `<h3>` do título (ex.: botão de ajuda) — não confundir com `action`, que fica à direita do header. */
  titleAdornment?: ReactNode;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
};

/**
 * Container de seção do Dashboard (Cartões e Dívidas, Parcelamentos Ativos) —
 * mesma receita visual do `ChartWrapper`/`KPICard`/`AlertCard` (border +
 * shadow + header com título 14px/800), sem repetir o header de gráfico
 * (que já tem legenda inline própria).
 */
export function SectionCard({ title, titleAdornment, action, children, className }: SectionCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card", CARD_SHADOW_CLASS, className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-[15px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
          {titleAdornment}
        </div>
        {action && (
          <Link href={action.href} className={cn(buttonVariants({ variant: "neutral", size: "sm" }))}>
            {action.label}
          </Link>
        )}
      </div>
      <div className="px-[18px] py-4">{children}</div>
    </div>
  );
}
