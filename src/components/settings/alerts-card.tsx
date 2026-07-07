"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
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
 * Reserva a mesma altura pros 3 labels do grid abaixo, alinhados por baixo
 * (`items-end`) — "Valor mínimo para disparar alerta" quebra em 2 linhas
 * nas colunas mais estreitas (`sm:grid-cols-3`) enquanto os outros 2 labels
 * cabem em 1 linha; sem isso o Input da coluna do meio ficava mais baixo que
 * os vizinhos (label bold + subtítulo muted — mesma altura reservada de
 * `PreferenceRow`, preferences-card.tsx, aplicada aqui a labels em vez de linhas).
 */
const ALERT_LABEL_CLASSNAME = "sm:min-h-10 sm:items-end sm:leading-snug";

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

      notifySuccess("Configurações atualizadas");
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
              <Label htmlFor="alert-anomaly" className={ALERT_LABEL_CLASSNAME}>
                Multiplicador de atenção
              </Label>
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
              <Label htmlFor="alert-minimum" className={ALERT_LABEL_CLASSNAME}>
                Valor mínimo para disparar alerta
              </Label>
              <CurrencyInput
                id="alert-minimum"
                value={minimum}
                onValueChange={setMinimum}
                disabled={isPending}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-green" className={ALERT_LABEL_CLASSNAME}>
                Multiplicador de economia
              </Label>
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

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
