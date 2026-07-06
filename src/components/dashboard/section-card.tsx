import Link from "next/link";
import type { ReactNode } from "react";

import { CARD_SHADOW_CLASS, cn } from "@/lib/utils";

type SectionCardProps = {
  title: string;
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
export function SectionCard({ title, action, children, className }: SectionCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card", CARD_SHADOW_CLASS, className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-[15px]">
        <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
        {action && (
          <Link href={action.href} className="text-[12.5px] font-bold text-primary hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  );
}
