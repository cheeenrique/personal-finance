"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, SunMoon } from "lucide-react";

import { useHasMounted } from "@/hooks/use-has-mounted";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

/**
 * Toggle simples (ícone único sol/lua) do Header — não o segmented control de
 * 3 opções abaixo (esse fica só em Configurações). Referência visual:
 * `design/Personal Finance App.dc.html`, botão "Alternar tema" (38×38px,
 * alterna direto claro↔escuro, ignora "sistema" — mesmo padrão do `toggleMode`
 * do demo).
 */
export function HeaderThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();
  const isDark = mounted ? resolvedTheme !== "light" : true;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title="Alternar tema"
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className={cn(
        "flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-input text-foreground transition-colors hover:border-primary/40",
        FOCUS_RING_CLASS,
      )}
    >
      {isDark ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
    </button>
  );
}

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
              "flex h-[38px] items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-bold transition-colors duration-100 ease-pf-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-secondary",
            )}
          >
            <option.icon className="size-[15px]" aria-hidden="true" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
