import { TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandMarkSize = "md" | "lg";

const SIZE_CLASSES: Record<BrandMarkSize, { square: string; icon: string }> = {
  md: { square: "size-[38px] rounded-[11px]", icon: "size-5" },
  lg: { square: "size-12 rounded-[13px]", icon: "size-6" },
};

type BrandMarkProps = {
  size?: BrandMarkSize;
  className?: string;
};

/**
 * Símbolo da marca — TrendingUp laranja sobre quadrado com gradiente azul
 * (design/PERSONAL_FINANCE_DS_HANDOFF.md, "Identidade Visual" > "Logo e
 * Marca"). Mesmo tratamento visual usado na sidebar
 * (`components/layout/sidebar.tsx`), extraído aqui como peça standalone
 * reutilizável fora do shell autenticado (ex.: `/login`).
 */
export function BrandMark({ size = "md", className }: BrandMarkProps) {
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-primary to-blue-600",
        sizeClasses.square,
        className,
      )}
    >
      <TrendingUp className={cn("text-accent", sizeClasses.icon)} aria-hidden="true" />
    </span>
  );
}
