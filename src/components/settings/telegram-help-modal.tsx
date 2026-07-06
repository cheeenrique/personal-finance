"use client";

import { TriangleAlert } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";

type TelegramHelpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STEPS = [
  'Clique em "Vincular Telegram" abaixo — um código de 6 caracteres aparece, válido por 15 minutos.',
  "Abra o Telegram e procure o bot configurado no app (pergunte ao administrador o nome/@usuário do bot, se não souber).",
  "Envie a mensagem /vincular SEUCÓDIGO (troque pelo código exibido) diretamente pro bot.",
  'Em poucos segundos a página atualiza sozinha (checagem automática) e mostra "Vinculado".',
] as const;

/**
 * Passo a passo do vínculo por código (docs/12-SETTINGS.md, item 3) +
 * pré-requisito de infra que o usuário não descobre só clicando em "Vincular"
 * (bot precisa existir e ter token/webhook configurados no backend, exige
 * HTTPS público). Reaproveita `FormModal` (par Dialog/Sheet genérico do
 * projeto) mesmo sem ser formulário — mesmo precedente de
 * `InstallmentDetailsModal`.
 */
export function TelegramHelpModal({ open, onOpenChange }: TelegramHelpModalProps) {
  return (
    <FormModal open={open} onOpenChange={onOpenChange} title="Como vincular seu Telegram">
      <div className="flex flex-col gap-4">
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-muted-foreground">
                {index + 1}
              </span>
              <span className="text-[13px] font-medium text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>

        <div className="flex items-start gap-2.5 rounded-[10px] border border-warning/30 bg-warning/10 px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-on-warning" aria-hidden="true" />
          <p className="text-[13px] font-medium text-foreground">
            Isso só funciona se o bot do Telegram já estiver configurado neste servidor (token +
            webhook). Se o vínculo não completar depois de enviar a mensagem, o bot provavelmente
            ainda não foi configurado — fale com quem administra o deploy.
          </p>
        </div>

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Entendi
          </Button>
        </div>
      </div>
    </FormModal>
  );
}
