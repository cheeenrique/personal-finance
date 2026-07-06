"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "next-themes";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { updateSettingsAction } from "@/modules/settings/actions";
import { Theme } from "@/generated/prisma/enums";
import { notifyError } from "@/lib/toast";

type PreferencesCardProps = {
  currency: string;
  timezone: string;
};

function toThemeEnum(value: string | undefined): Theme {
  if (value === "light") return Theme.LIGHT;
  if (value === "dark") return Theme.DARK;
  return Theme.SYSTEM;
}

/**
 * Sincroniza o tema aplicado via `ThemeToggle` (next-themes/localStorage)
 * com `UserSettings.theme` no backend — o componente compartilhado em si só
 * cuida do estado visual, não conhece Server Actions (docs/12-SETTINGS.md,
 * "Tema": "aplicado imediatamente, sem reload" e persistido).
 *
 * Ignora a primeira leitura pós-hidratação (âncora) e só persiste em
 * mudanças subsequentes — evita sobrescrever o valor salvo com o
 * `defaultTheme` do provider antes de qualquer interação real do usuário.
 */
function usePersistThemeChange(): void {
  const { theme } = useTheme();
  const mounted = useHasMounted();
  const anchor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!mounted) return;

    if (anchor.current === undefined) {
      anchor.current = theme;
      return;
    }
    if (anchor.current === theme) return;
    anchor.current = theme;

    updateSettingsAction({ theme: toThemeEnum(theme) }).then((result) => {
      if (!result.success) notifyError(result.error.message);
    });
  }, [theme, mounted]);
}

type PreferenceRowProps = {
  label: string;
  subtitle?: string;
  children: ReactNode;
};

/** Linha label+subtítulo à esquerda / controle à direita — mesmo padrão nas 3 seções deste card. */
function PreferenceRow({ label, subtitle, children }: PreferenceRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div>
        <p className="text-sm font-bold text-foreground">{label}</p>
        {subtitle && <p className="text-[13px] font-medium text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function PillValue({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-lg border border-border bg-secondary px-3 py-1.5 font-mono text-sm font-semibold text-foreground">
      {children}
    </span>
  );
}

export function PreferencesCard({ currency, timezone }: PreferencesCardProps) {
  usePersistThemeChange();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências gerais</CardTitle>
        <CardDescription>Moeda e fuso horário são fixos nesta versão do app.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col">
        <PreferenceRow label="Moeda" subtitle="Real brasileiro · sem multi-moeda">
          <PillValue>{currency === "BRL" ? "R$ · BRL" : currency}</PillValue>
        </PreferenceRow>

        <PreferenceRow label="Fuso horário" subtitle="Fixo">
          <PillValue>{timezone}</PillValue>
        </PreferenceRow>

        <PreferenceRow label="Tema">
          <ThemeToggle />
        </PreferenceRow>
      </CardContent>
    </Card>
  );
}
