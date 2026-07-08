"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createTagAction, updateTagAction } from "@/modules/tags/actions";
import { notifySuccess } from "@/lib/toast";
import { cn, getContrastText } from "@/lib/utils";
import { DEFAULT_TAG_COLOR, TAG_COLOR_OPTIONS } from "./tag-config";
import type { Tag } from "@/generated/prisma/client";

type TagFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação. Presente = edição (docs/25-TAGS.md, "Criação de Tag"). */
  tag: Tag | null;
};

/**
 * Modal único de criar/editar tag (FormModal padrão do handoff) — mesmo
 * padrão de reset de estado ao abrir de
 * `components/accounts/account-form-modal.tsx` (ajuste de state durante o
 * render, sem `useEffect`).
 */
export function TagFormModal({ open, onOpenChange, tag }: TagFormModalProps) {
  const isEditing = tag !== null;

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormError(null);
      setFieldErrors({});
      setName(tag?.name ?? "");
      setColor(tag?.color ?? DEFAULT_TAG_COLOR);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(name)) errors.name = "Nome é obrigatório.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = isEditing
        ? await updateTagAction(tag.id, { name, color })
        : await createTagAction({ name, color });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEditing ? "Tag atualizada" : "Tag criada");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar tag" : "Nova tag"}
      description="Marcadores livres e opcionais para contextualizar suas transações."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Nome" htmlFor="tag-name" required error={fieldErrors.name}>
          <Input
            id="tag-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
            placeholder="Ex.: Viagem, Filho, MacBook…"
            aria-invalid={Boolean(fieldErrors.name)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <div className="flex flex-col gap-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {TAG_COLOR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                disabled={isPending}
                aria-label={`Cor ${option}`}
                aria-pressed={color === option}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2 transition-transform",
                  color === option ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: option }}
              >
                {color === option && (
                  <Check
                    className="size-4"
                    style={{ color: getContrastText(option) }}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Salvar
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
