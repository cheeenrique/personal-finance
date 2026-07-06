"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/forms/currency-input";
import { updateSettingsAction } from "@/modules/settings/actions";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";

type AlertsCardProps = {
  alertAnomalyMultiplier: string;
  alertMinimumAmount: string;
  alertGreenMultiplier: string;
};

/**
 * Alertas (thresholds) — docs/12-SETTINGS.md, item 2. Os 3 campos batem 1:1
 * com `UserSettings.alertAnomalyMultiplier/alertMinimumAmount/alertGreenMultiplier`;
 * validação de range (>0, máx. 99.99, 2 casas decimais) já vive no
 * `updateSettingsSchema` do módulo — aqui só refletimos o erro do backend.
 * Alterar aqui só afeta a próxima execução do cron semanal (Regra do doc).
 */
export function AlertsCard({
  alertAnomalyMultiplier,
  alertMinimumAmount,
  alertGreenMultiplier,
}: AlertsCardProps) {
  const [anomaly, setAnomaly] = useState(alertAnomalyMultiplier);
  const [minimum, setMinimum] = useState(alertMinimumAmount);
  const [green, setGreen] = useState(alertGreenMultiplier);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateSettingsAction({
        alertAnomalyMultiplier: anomaly,
        alertMinimumAmount: minimum,
        alertGreenMultiplier: green,
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }

      notifySuccess("Configurações atualizadas.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas</CardTitle>
        <CardDescription>Sensibilidade dos alertas gerados pelo resumo semanal.</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-anomaly">Multiplicador de atenção</Label>
              <Input
                id="alert-anomaly"
                inputMode="decimal"
                value={anomaly}
                onChange={(event) => setAnomaly(event.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-minimum">Valor mínimo para disparar alerta</Label>
              <CurrencyInput
                id="alert-minimum"
                value={minimum}
                onValueChange={setMinimum}
                disabled={isPending}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-green">Multiplicador de economia</Label>
              <Input
                id="alert-green"
                inputMode="decimal"
                value={green}
                onChange={(event) => setGreen(event.target.value)}
                disabled={isPending}
                required
              />
            </div>
          </div>

          <p className="rounded-lg bg-secondary/60 p-3 text-[13px] font-medium text-muted-foreground">
            Atenção quando o gasto da semana numa categoria passa de {anomaly || "0"}x a média e é
            maior que {formatBRL(minimum || "0")}. Economia quando o gasto fica abaixo de{" "}
            {green || "0"}x a média.
          </p>

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Salvar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
