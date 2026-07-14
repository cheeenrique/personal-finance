"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntitySelect } from "@/components/forms/entity-select";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createAssetAction, updateAssetAction } from "@/modules/assets/actions";
import { AssetType } from "@/generated/prisma/enums";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import { ASSET_TYPE_OPTIONS, ASSET_TYPE_OPTIONS_FOR_CREATE } from "./asset-config";
import type { AssetCardData } from "./types";

type AssetFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação. Presente = edição (docs/27-ASSETS.md, "Criação de Asset"). */
  asset: AssetCardData | null;
};

/**
 * Modal único de criar/editar asset (FormModal padrão do handoff). Editar
 * `currentValue` gera um `AssetSnapshot` — regra já implementada no service
 * (`modules/assets/repository.ts` `update`), transparente pra este form.
 */
export function AssetFormModal({ open, onOpenChange, asset }: AssetFormModalProps) {
  const isEditing = asset !== null;

  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>(AssetType.OTHER);
  const [purchaseValue, setPurchaseValue] = useState("0");
  const [currentValue, setCurrentValue] = useState("0");
  const [purchaseDate, setPurchaseDate] = useState(toDateInputValueSaoPaulo());
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reidrata o formulário sempre que o modal abre — "adjusting state when a
   * prop changes" (react.dev/learn/you-might-not-need-an-effect), feito
   * durante o render (não em `useEffect`), mesmo padrão de
   * `components/accounts/account-form-modal.tsx`.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormError(null);
      setFieldErrors({});
      setName(asset?.name ?? "");
      setType(asset?.type ?? AssetType.OTHER);
      setPurchaseValue(asset?.purchaseValue ?? "0");
      setCurrentValue(asset?.currentValue ?? "0");
      setPurchaseDate(asset ? toDateInputValueSaoPaulo(asset.purchaseDate) : toDateInputValueSaoPaulo());
      setNotes(asset?.notes ?? "");
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(name)) errors.name = "Nome é obrigatório.";
    if (!type) errors.type = "Selecione um tipo.";
    if (isBlank(purchaseValue)) errors.purchaseValue = "Informe um valor.";
    if (isBlank(currentValue)) errors.currentValue = "Informe um valor.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const trimmedNotes = notes.trim();

      const result = isEditing
        ? await updateAssetAction(asset.id, {
            name,
            type,
            purchaseValue,
            currentValue,
            purchaseDate,
            notes: trimmedNotes || null,
          })
        : await createAssetAction({
            name,
            type,
            purchaseValue,
            currentValue,
            purchaseDate,
            notes: trimmedNotes || undefined,
          });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEditing ? "Ativo atualizado" : "Ativo criado");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar ativo" : "Novo ativo"}
      description="Assets representam bens acumulados — não impactam saldo de conta nem fluxo de caixa."
      size="tall"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="asset-form" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Salvar
          </Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Nome" htmlFor="asset-name" required error={fieldErrors.name}>
          <Input
            id="asset-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
            placeholder="Ex.: Casa em SP, Tesouro Direto…"
            aria-invalid={Boolean(fieldErrors.name)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField label="Tipo" htmlFor="asset-type" required error={fieldErrors.type}>
          <EntitySelect
            id="asset-type"
            options={isEditing ? ASSET_TYPE_OPTIONS : ASSET_TYPE_OPTIONS_FOR_CREATE}
            value={type}
            onValueChange={(value) => {
              setType(value as AssetType);
              clearFieldError("type");
            }}
            placeholder="Selecione o tipo"
            disabled={isPending || (isEditing && type === AssetType.INVESTMENT)}
            aria-invalid={Boolean(fieldErrors.type)}
            className="w-full"
          />
        </FormField>

        <FormField label="Valor de compra" htmlFor="asset-purchase-value" required error={fieldErrors.purchaseValue}>
          <CurrencyInput
            id="asset-purchase-value"
            value={purchaseValue}
            onValueChange={(value) => {
              setPurchaseValue(value);
              clearFieldError("purchaseValue");
            }}
            aria-invalid={Boolean(fieldErrors.purchaseValue)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Valor atual" htmlFor="asset-current-value" required error={fieldErrors.currentValue}>
          <CurrencyInput
            id="asset-current-value"
            value={currentValue}
            onValueChange={(value) => {
              setCurrentValue(value);
              clearFieldError("currentValue");
            }}
            aria-invalid={Boolean(fieldErrors.currentValue)}
            disabled={isPending}
          />
        </FormField>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="asset-purchase-date">Data de aquisição</Label>
          <DateField id="asset-purchase-date" value={purchaseDate} onValueChange={setPurchaseDate} disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="asset-notes">Observações (opcional)</Label>
          <Textarea
            id="asset-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isPending}
          />
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
      </form>
    </FormModal>
  );
}
