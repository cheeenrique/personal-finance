import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

export type IconActionButtonTone = "default" | "danger" | "success";

type IconActionButtonProps = {
  icon: LucideIcon;
  /** `default` = hover azul/estrutural. `danger` = hover vermelho (ação destrutiva). `success` = hover verde (ação positiva, ex.: marcar como paga). */
  tone?: IconActionButtonTone;
  /** aria-label obrigatório — também vira o texto do Tooltip quando habilitado. */
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** Texto do Tooltip quando `disabled`. Se omitido, usa `label`. */
  disabledReason?: string;
};

const TONE_HOVER_CLASSES: Record<IconActionButtonTone, string> = {
  default: "hover:border-primary hover:text-primary",
  danger: "hover:border-destructive hover:text-destructive",
  success: "hover:border-success hover:text-success",
};

/**
 * Botão ícone-só de ação (editar/excluir) usado em cards e linhas de
 * entidade em toda a aplicação — mesmo comportamento em toda a app
 * (docs/04-DESIGN_SYSTEM.md, "Consistência"). Centraliza o estilo (28x28px,
 * `rounded-[7px]`) e já embute o `Tooltip`, então callers não precisam
 * wire isso manualmente. `cursor-pointer` é explícito porque o Preflight do
 * Tailwind zera o cursor de `<button>` por padrão.
 *
 * Alvo de toque: o visual continua 28x28px (docs/04-DESIGN_SYSTEM.md,
 * "Tamanho dos Componentes" — compacto), mas a área clicável real é maior via
 * `::before` transparente com `-inset-2` (28px + 8px de cada lado = 44px),
 * sem crescer nada visualmente nem mexer no layout dos cards que já
 * empilham vários desses lado a lado (docs/50-AUDITORIA-BACKLOG.md, LA5).
 */
export function IconActionButton({
  icon: Icon,
  tone = "default",
  label,
  onClick,
  disabled = false,
  disabledReason,
}: IconActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={cn(
              "relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border text-muted-foreground transition-colors before:absolute before:-inset-2 before:content-[''] disabled:cursor-not-allowed disabled:opacity-40",
              TONE_HOVER_CLASSES[tone],
              FOCUS_RING_CLASS,
            )}
          />
        }
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{disabled ? (disabledReason ?? label) : label}</TooltipContent>
    </Tooltip>
  );
}
