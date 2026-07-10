import { cn } from "@/lib/utils";

type BrandMarkProps = {
  /** Texto livre digitado em `Card.brand` (`card-form-modal.tsx`) — sem enum, o usuário digita qualquer bandeira. */
  brand: string | null;
  className?: string;
};

/**
 * Aproximação TIPOGRÁFICA da bandeira, nunca o logo oficial (sem
 * licenciamento pra reproduzir marca registrada) — detecção por substring
 * case-insensitive no texto livre de `brand`, mesma lista de atalhos
 * oferecida no form (`card-form-modal.tsx`). Puramente decorativo
 * (`CardFace` já marca a arte inteira como `aria-hidden`).
 */
export function BrandMark({ brand, className }: BrandMarkProps) {
  const normalized = (brand ?? "").trim().toLowerCase();

  if (normalized.includes("master")) {
    return (
      <div className={cn("flex items-center", className)}>
        <span className="size-4 rounded-full bg-[#EB001B] sm:size-[18px]" />
        <span className="-ml-2 size-4 rounded-full bg-[#F79E1B] mix-blend-screen sm:-ml-2.5 sm:size-[18px]" />
      </div>
    );
  }

  if (normalized.includes("visa")) {
    return (
      <span className={cn("font-mono text-[15px] font-black tracking-tight italic sm:text-lg", className)}>
        VISA
      </span>
    );
  }

  if (normalized.includes("amex") || normalized.includes("american")) {
    return (
      <span
        className={cn(
          "rounded-[3px] bg-white/90 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-[#016FD0] sm:text-[10px]",
          className,
        )}
      >
        AMEX
      </span>
    );
  }

  if (normalized.includes("elo")) {
    return <span className={cn("text-sm font-black italic sm:text-base", className)}>elo</span>;
  }

  if (normalized.includes("hiper")) {
    return <span className={cn("text-xs font-extrabold italic sm:text-sm", className)}>hiper</span>;
  }

  if (normalized.includes("diners")) {
    return <span className={cn("text-xs font-bold italic sm:text-sm", className)}>Diners</span>;
  }

  if (normalized.includes("discover")) {
    return <span className={cn("text-xs font-extrabold sm:text-sm", className)}>Discover</span>;
  }

  if (!normalized) return null;

  return (
    <span className={cn("truncate text-[11px] font-extrabold tracking-wide uppercase sm:text-xs", className)}>
      {brand}
    </span>
  );
}
