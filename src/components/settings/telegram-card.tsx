import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type TelegramCardProps = {
  chatId: string | null;
};

/**
 * Checkboxes de preferência de envio — stub visual (docs/12-SETTINGS.md não
 * define persistência para isso ainda; task pediu explicitamente "sem
 * persistência"). `disabled` + rótulo "(em breve)" deixam claro que ainda
 * não fazem nada.
 */
const STUB_PREFERENCES = [
  { id: "telegram-pref-weekly", label: "Receber resumo semanal" },
  { id: "telegram-pref-anomaly", label: "Receber alertas de atenção" },
  { id: "telegram-pref-green", label: "Receber alertas verdes" },
] as const;

/**
 * Status do vínculo com o Telegram — docs/12-SETTINGS.md, item 3. `chat_id`
 * é sempre read-only aqui: vem da allowlist (env), nunca de `UserSettings`
 * (sem botão de vincular/desvincular pela UI).
 */
export function TelegramCard({ chatId }: TelegramCardProps) {
  const isLinked = Boolean(chatId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>Status do vínculo com o bot do Telegram.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={isLinked ? "outline" : "secondary"}
            className={cn(isLinked && "border-success/30 bg-success/16 text-success")}
          >
            {isLinked ? "Vinculado" : "Não vinculado"}
          </Badge>
          {isLinked && (
            <span className="font-mono text-xs font-medium text-muted-foreground">
              chat_id: {chatId}
            </span>
          )}
        </div>

        {!isLinked && (
          <p className="text-[13px] font-medium text-muted-foreground">
            Procure o administrador do sistema para vincular seu Telegram.
          </p>
        )}

        <div className="flex flex-col gap-2.5 opacity-60">
          <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
            Preferências de envio (em breve)
          </p>
          {STUB_PREFERENCES.map((preference) => (
            <label
              key={preference.id}
              htmlFor={preference.id}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Checkbox id={preference.id} disabled />
              {preference.label}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
