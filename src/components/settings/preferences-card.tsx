"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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

export function PreferencesCard({ currency, timezone }: PreferencesCardProps) {
  usePersistThemeChange();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências</CardTitle>
        <CardDescription>Moeda e fuso horário são fixos nesta versão do app.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Moeda</Label>
          <p className="text-sm font-medium text-muted-foreground">
            {currency === "BRL" ? "Real (BRL)" : currency}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Timezone</Label>
          <p className="font-mono text-sm font-medium text-muted-foreground">{timezone}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Tema</Label>
          <ThemeToggle />
        </div>
      </CardContent>
    </Card>
  );
}
