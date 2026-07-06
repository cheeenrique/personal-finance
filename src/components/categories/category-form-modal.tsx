"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createCategoryAction, updateCategoryAction } from "@/modules/categories/actions";
import { CategoryType } from "@/generated/prisma/enums";
import type { Category } from "@/modules/categories/types";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CATEGORY_TYPE_DEFAULT_COLOR,
  CATEGORY_TYPE_LABELS,
} from "./category-config";

/** Sentinela pra "sem pai" no `EntitySelect` — mesmo padrão de `transaction-filters-bar.tsx` (`ALL_VALUE`). */
const NO_PARENT_VALUE = "__ROOT__";

const CATEGORY_TYPE_OPTIONS: EntitySelectOption[] = [
  { value: CategoryType.EXPENSE, label: CATEGORY_TYPE_LABELS[CategoryType.EXPENSE] },
  { value: CategoryType.INCOME, label: CATEGORY_TYPE_LABELS[CategoryType.INCOME] },
];

export type FlatCategory = Pick<Category, "id" | "name" | "type" | "parentId">;

type CategoryFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação. Presente = edição — `type` não é editável (docs/24-CATEGORIES.md, "Regra de Tipo"). */
  category: Category | null;
  /** Lista achatada (todos os tipos) usada só pra montar as opções de "categoria pai". */
  allCategories: FlatCategory[];
  /** Tipo pré-selecionado ao criar a partir da aba Despesas/Receitas. Ignorado em edição. */
  defaultType: CategoryType;
};

/**
 * Modal único de criar/editar categoria (FormModal padrão do handoff,
 * docs/24-CATEGORIES.md "Criação de Categoria": nome, tipo, ícone, cor, pai
 * opcional). Só permite selecionar como pai uma categoria raiz do mesmo tipo
 * — a hierarquia do seed é de 2 níveis (docs/24-CATEGORIES.md, "Hierarquia");
 * o backend (`wouldCreateCycle`) continua sendo a defesa real contra ciclos.
 */
export function CategoryFormModal({
  open,
  onOpenChange,
  category,
  allCategories,
  defaultType,
}: CategoryFormModalProps) {
  const isEditing = category !== null;

  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>(defaultType);
  const [parentId, setParentId] = useState<string | null>(null);
  const [color, setColor] = useState<string>(CATEGORY_TYPE_DEFAULT_COLOR[defaultType]);
  const [icon, setIcon] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reidrata o formulário sempre que o modal abre — durante o render (não em
   * `useEffect`), mesmo padrão de `account-form-modal.tsx`.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormError(null);
      setFieldErrors({});
      setName(category?.name ?? "");
      setType(category?.type ?? defaultType);
      setParentId(category?.parentId ?? null);
      setColor(category?.color ?? CATEGORY_TYPE_DEFAULT_COLOR[category?.type ?? defaultType]);
      setIcon(category?.icon ?? null);
    }
  }

  const parentOptions = useMemo(() => {
    return allCategories
      .filter((c) => c.parentId === null && c.type === type && c.id !== category?.id)
      .map((c) => ({ value: c.id, label: c.name }));
  }, [allCategories, type, category?.id]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(name)) errors.name = "Nome é obrigatório.";
    if (!isEditing && !type) errors.type = "Selecione um tipo.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = isEditing
        ? await updateCategoryAction(category.id, { name, color, icon, parentId })
        : await createCategoryAction({
            name,
            type,
            color,
            icon: icon ?? undefined,
            parentId: parentId ?? undefined,
          });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEditing ? "Categoria atualizada" : "Categoria criada");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar categoria" : "Nova categoria"}
      description="Categorias organizam as transações e alimentam relatórios e gráficos."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Nome" htmlFor="category-name" required error={fieldErrors.name}>
          <Input
            id="category-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
            placeholder="Ex.: Mercado, Streaming…"
            aria-invalid={Boolean(fieldErrors.name)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField
          label="Tipo"
          htmlFor="category-type"
          required={!isEditing}
          error={fieldErrors.type}
        >
          {isEditing ? (
            <p id="category-type" className="text-sm font-medium text-muted-foreground">
              {CATEGORY_TYPE_LABELS[type]} — tipo não pode ser alterado após a criação.
            </p>
          ) : (
            <EntitySelect
              id="category-type"
              options={CATEGORY_TYPE_OPTIONS}
              value={type}
              onValueChange={(value) => {
                const nextType = value as CategoryType;
                setType(nextType);
                setParentId(null);
                setColor((current) =>
                  Object.values(CATEGORY_TYPE_DEFAULT_COLOR).includes(current)
                    ? CATEGORY_TYPE_DEFAULT_COLOR[nextType]
                    : current,
                );
                clearFieldError("type");
              }}
              placeholder="Selecione o tipo"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.type)}
              className="w-full"
            />
          )}
        </FormField>

        <div className="flex flex-col gap-1.5">
          <Label>Categoria pai (opcional)</Label>
          <EntitySelect
            options={[{ value: NO_PARENT_VALUE, label: "Nenhuma (categoria raiz)" }, ...parentOptions]}
            value={parentId ?? NO_PARENT_VALUE}
            onValueChange={(value) => setParentId(value === NO_PARENT_VALUE ? null : value)}
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLOR_OPTIONS.map((option) => (
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
                {color === option && <Check className="size-4 text-white" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Ícone (opcional)</Label>
          <div className="flex max-h-[176px] flex-wrap gap-2 overflow-y-auto rounded-lg border border-border p-2">
            {CATEGORY_ICON_OPTIONS.map((option) => {
              const OptionIcon = option.icon;
              const selected = icon === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setIcon(selected ? null : option.value)}
                  disabled={isPending}
                  aria-label={option.label}
                  aria-pressed={selected}
                  title={option.label}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-[10px] border transition-colors",
                    selected
                      ? "border-primary bg-primary/16 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <OptionIcon className="size-4" aria-hidden="true" />
                </button>
              );
            })}
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
