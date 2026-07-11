import type { Transition, Variants } from "framer-motion";

/**
 * cubic-bezier(0.16, 1, 0.3, 1) — mesma curva do token `--ease-pf-out`
 * (`globals.css`, docs/04-DESIGN_SYSTEM.md "Animações"), só que como array
 * pro framer-motion (que não lê custom property CSS). Usado em toda
 * animação do import multi-arquivo pra ficar consistente com o resto do
 * produto — respeitado via `<MotionConfig reducedMotion="user">` no modal
 * (desliga tudo isso quando `prefers-reduced-motion` está ativo).
 */
export const PF_EASE_OUT: NonNullable<Transition["ease"]> = [0.16, 1, 0.3, 1];

/** Troca de step do modal (select → preview → result) — fade + slide 12px, 220ms. */
export const stepVariants: Variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export const STEP_TRANSITION: Transition = { duration: 0.22, ease: PF_EASE_OUT };

/** Container de lista com stagger (linhas de arquivo, itens da prévia) — intervalo entre itens configurável (40–60ms conforme o handoff). */
export function listContainerVariants(staggerSeconds: number): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: staggerSeconds } },
  };
}

/** Item de lista — fade + slide-up, 200ms. */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: PF_EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: PF_EASE_OUT } },
};

/** Ícone de sucesso do step result — pop scale 0.8 → 1, 300ms. */
export const successIconTransition: Transition = { duration: 0.3, ease: PF_EASE_OUT };
