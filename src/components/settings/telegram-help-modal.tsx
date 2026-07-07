"use client";

import { TriangleAlert } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";

type TelegramHelpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STEPS = [
  "Abra o Telegram, procure @BotFather e mande /newbot — escolha um nome e um @usuário pro seu bot.",
  "O BotFather te devolve um token (ex.: 123456789:ABCdef...). Copie ele.",
  'Cole o token aqui em Configurações e clique em "Instalar bot" — o sistema valida o token e registra o webhook automaticamente.',
  'Clique em "Vincular chat" — um código de 6 caracteres aparece, válido por 15 minutos.',
  "Envie a mensagem /vincular SEUCÓDIGO (troque pelo código exibido) diretamente pro SEU bot.",
  'Em poucos segundos a página atualiza sozinha (checagem automática) e mostra "Vinculado".',
] as const;

/**
 * Passo a passo do modelo "traga seu próprio bot" (docs/30-TELEGRAM.md):
 * criar o bot no @BotFather, colar o token, instalar, e só depois vincular o
 * chat por código (docs/12-SETTINGS.md, item 3). Reaproveita `FormModal`
 * (par Dialog/Sheet genérico do projeto) mesmo sem ser formulário — mesmo
 * precedente de `InstallmentDetailsModal`.
 */
export function TelegramHelpModal({ open, onOpenChange }: TelegramHelpModalProps) {
  return (
    <FormModal open={open} onOpenChange={onOpenChange} title="Como instalar e vincular seu Telegram">
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
            O registro automático do webhook só funciona com uma URL pública (HTTPS) — em
            desenvolvimento local (localhost) o bot fica salvo, mas o webhook não é registrado até
            o deploy. Nesse caso a tela mostra um aviso e volta a funcionar sozinha depois que a
            aplicação estiver publicada.
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
