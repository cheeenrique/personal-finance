import { toast } from "sonner";

/**
 * Wrapper fino sobre `sonner` — padroniza a mensagem de sucesso
 * ("✔ Transação salva", "✔ Cartão atualizado") em toda a aplicação
 * (docs/04-DESIGN_SYSTEM.md, "Feedback"). Toast nunca bloqueia a tela, some
 * sozinho, empilha se houver mais de um.
 */
export function notifySuccess(message: string, options?: { action?: { label: string; onClick: () => void } }) {
  toast.success(`✔ ${message}`, options);
}

export function notifyError(message: string) {
  toast.error(message);
}

export { toast };
