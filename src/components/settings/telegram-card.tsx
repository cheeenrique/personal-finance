"use client";

import { useEffect, useState, useTransition } from "react";
import { CircleHelp, Copy, Link2, Loader2, Unlink } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TelegramHelpModal } from "@/components/settings/telegram-help-modal";
import {
  generateTelegramLinkCodeAction,
  getSettingsAction,
  unlinkTelegramAction,
} from "@/modules/settings/actions";
import type { TelegramLinkCode } from "@/modules/settings/types";
import { formatTimeSaoPaulo } from "@/lib/date/format";
import { notifyError, notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

type TelegramCardProps = {
  chatId: string | null;
  pendingCode: TelegramLinkCode | null;
};

/** Enquanto o código pendente está visível, checa a cada 4s se o vínculo já foi confirmado pelo bot (sem precisar de reload manual). */
const POLL_INTERVAL_MS = 4000;

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
 * Vínculo por código — docs/12-SETTINGS.md, item 3: usuário gera um código
 * de 6 caracteres (válido 15min), envia `/vincular <CODE>` (ou o deep-link
 * `/start <CODE>`) pro bot, e o webhook (`modules/telegram/link.ts`)
 * confirma o vínculo em `UserSettings.telegramChatId`. Sem edição manual de
 * `.env` — cada usuário se vincula sozinho.
 */
export function TelegramCard({ chatId, pendingCode }: TelegramCardProps) {
  const [linkedChatId, setLinkedChatId] = useState(chatId);
  const [code, setCode] = useState<TelegramLinkCode | null>(pendingCode);
  const [isUnlinkOpen, setUnlinkOpen] = useState(false);
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isLinked = Boolean(linkedChatId);

  function handleGenerateCode() {
    startTransition(async () => {
      const result = await generateTelegramLinkCodeAction();
      if (!result.success) {
        notifyError(result.error.message);
        return;
      }
      setCode(result.data);
    });
  }

  async function handleUnlink() {
    const result = await unlinkTelegramAction();
    if (!result.success) throw new Error(result.error.message);
    setLinkedChatId(null);
    notifySuccess("Telegram desvinculado.");
  }

  function handleCopyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code.code);
    notifySuccess("Código copiado.");
  }

  // Polling curto: detecta automaticamente quando o vínculo é confirmado
  // pelo bot, sem exigir reload manual da tela. Sem UI de loading própria e
  // só chama `setState` nas 2 transições reais (vinculou / código expirou) —
  // um poll "sem novidade" não re-renderiza nada, então a tela não pisca.
  useEffect(() => {
    if (!code || isLinked) return;

    const interval = setInterval(async () => {
      const result = await getSettingsAction();
      if (!result.success) return;

      if (result.data.telegramChatId) {
        setLinkedChatId(result.data.telegramChatId);
        setCode(null);
        notifySuccess("Telegram vinculado com sucesso.");
        return;
      }

      // Código pode ter expirado no meio do polling — reflete o backend (nunca mostra código morto).
      if (!result.data.telegramLinkCode) {
        setCode(null);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [code, isLinked]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>Vincule seu Telegram pessoal para lançar gastos e receber alertas.</CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setHelpOpen(true)}
            aria-label="Como vincular o Telegram"
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Status: label bold + subtítulo muted — mesma linguagem visual de `PreferenceRow`
            (preferences-card.tsx). chat_id fica em mono (dado numérico, docs/04-DESIGN_SYSTEM.md
            "Tipografia": número sempre em mono, nunca em Nunito). */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Status</p>
            <p className="text-[13px] font-medium text-muted-foreground">
              {isLinked ? (
                <>
                  Vinculado ao <span className="font-mono text-foreground">chat_id {linkedChatId}</span>.
                </>
              ) : (
                "Vincule seu Telegram pessoal para lançar gastos e receber alertas."
              )}
            </p>
          </div>
          <Badge
            variant={isLinked ? "outline" : "secondary"}
            className={cn("shrink-0", isLinked && "border-success/30 bg-success/16 text-success")}
          >
            {isLinked ? "Vinculado" : "Não vinculado"}
          </Badge>
        </div>

        {isLinked && (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setUnlinkOpen(true)}
          >
            <Unlink className="size-4" aria-hidden="true" />
            Desvincular
          </Button>
        )}

        {!isLinked && !code && (
          <Button type="button" className="w-fit" onClick={handleGenerateCode} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            <Link2 className="size-4" aria-hidden="true" />
            Vincular Telegram
          </Button>
        )}

        {!isLinked && code && (
          <div className="flex flex-col gap-3 rounded-lg bg-secondary/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-bold tracking-[0.3em] text-foreground">{code.code}</span>
              <Button type="button" variant="ghost" size="icon" onClick={handleCopyCode} aria-label="Copiar código">
                <Copy className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <p className="text-[13px] font-medium text-muted-foreground">
              Envie <strong className="font-mono text-foreground">/vincular {code.code}</strong> para o bot no
              Telegram. Expira às {formatTimeSaoPaulo(code.expiresAt)}.
            </p>

            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={handleGenerateCode}
              disabled={isPending}
            >
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Gerar novo código
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2.5 border-t border-border pt-4 opacity-60">
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

      <ConfirmDialog
        open={isUnlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="Desvincular Telegram"
        description="Você para de receber notificações e não poderá mais lançar transações por lá até vincular novamente."
        confirmLabel="Desvincular"
        onConfirm={handleUnlink}
      />

      <TelegramHelpModal open={isHelpOpen} onOpenChange={setHelpOpen} />
    </Card>
  );
}
