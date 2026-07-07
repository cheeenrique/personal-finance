import { toast } from "sonner";

/**
 * Wrapper fino sobre `sonner` — padroniza toasts de sucesso/erro em toda a
 * aplicação (docs/04-DESIGN_SYSTEM.md, "Feedback"). Cor (verde/vermelho) e
 * ícone (check/x) já vêm do `<Toaster>` em `app/layout.tsx` por tipo — a
 * mensagem NÃO deve repetir isso (nada de "✔"/"com sucesso" na string).
 * Toast nunca bloqueia a tela, some sozinho, empilha se houver mais de um.
 */
export function notifySuccess(message: string, options?: { action?: { label: string; onClick: () => void } }) {
  toast.success(message, options);
}

export function notifyError(message: string) {
  toast.error(message);
}

export { toast };
