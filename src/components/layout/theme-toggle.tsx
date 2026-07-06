"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, SunMoon } from "lucide-react";

import { useHasMounted } from "@/hooks/use-has-mounted";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: SunMoon },
] as const;

/**
 * Toggle de tema — segmented control de 3 opções (Claro/Escuro/Sistema),
 * não dropdown (design/PERSONAL_FINANCE_DS_HANDOFF.md, "Chips / Segmented
 * Control"): ativo com fundo `--primary` + texto branco, inativo transparente.
 * Aplica via `next-themes` (localStorage + atributo `class`), sem reload.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();
  const current = mounted ? (theme ?? "system") : "dark";

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="flex items-center gap-0 rounded-[10px] border border-border p-0.5"
    >
      {OPTIONS.map((option) => {
        const isActive = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-bold transition-colors duration-100 ease-pf-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-secondary",
            )}
          >
            <option.icon className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
