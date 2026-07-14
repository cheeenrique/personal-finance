"use client";

import { Loader2 } from "lucide-react";

import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type FormModalActionsProps = {
  onCancel: () => void;
  cancelLabel?: string;
  submitLabel: string;
  /** `id` do `<form>` — associa o botão de submit via atributo `form=` sem precisar aninhar o `<form>` no footer (footer fica fora da área scrollável, ver `FormModal`). Use isso OU `onSubmit`, não os dois. */
  submitForm?: string;
  /** Alternativa a `submitForm` pra footers sem `<form>` associável (ex.: ação que não é submit de formulário). */
  onSubmit?: () => void;
  isPending?: boolean;
  submitDisabled?: boolean;
  submitVariant?: VariantProps<typeof buttonVariants>["variant"];
};

/**
 * Footer padrão de `FormModal`: dois botões lado a lado, `flex-1` cada,
 * altura maior no mobile (`h-11`, touch target) e o tamanho de desktop atual
 * (`sm:h-10`) — Cancelar (`outline`) à esquerda, ação principal à direita.
 * Objetivo: todo modal usar isso no `footer` em vez de montar os botões à
 * mão, garantindo tamanho/altura consistentes (docs/04-DESIGN_SYSTEM.md).
 */
export function FormModalActions({
  onCancel,
  cancelLabel = "Cancelar",
  submitLabel,
  submitForm,
  onSubmit,
  isPending = false,
  submitDisabled = false,
  submitVariant = "default",
}: FormModalActionsProps) {
  return (
    // `w-full` explícito — os botões `flex-1` precisam de uma largura de referência
    // fixa pra dividir igualmente, independente do `flex-col-reverse`/`sm:flex-row`
    // do `DialogFooter`/`SheetFooter` (mobile stacka o footer inteiro, não os botões).
    <div className="flex w-full gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 flex-1 sm:h-10"
        onClick={onCancel}
        disabled={isPending}
      >
        {cancelLabel}
      </Button>
      <Button
        type={submitForm ? "submit" : "button"}
        form={submitForm}
        variant={submitVariant}
        className="h-11 flex-1 sm:h-10"
        onClick={onSubmit}
        disabled={isPending || submitDisabled}
      >
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </div>
  );
}
