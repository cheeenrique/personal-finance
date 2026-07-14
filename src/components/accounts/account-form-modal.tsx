"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { FormModalActions } from "@/components/shared/form-modal-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntitySelect } from "@/components/forms/entity-select";
import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { createAccountAction, updateAccountAction } from "@/modules/accounts/actions";
import { AccountType } from "@/generated/prisma/enums";
import { notifySuccess } from "@/lib/toast";
import { cn, getContrastText } from "@/lib/utils";
import {
  ACCOUNT_COLOR_OPTIONS,
  ACCOUNT_ICON_OPTIONS,
  ACCOUNT_TYPE_OPTIONS,
  DEFAULT_ACCOUNT_COLOR,
} from "./account-config";
import type { AccountCardData } from "./types";

type AccountFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação. Presente = edição (docs/21-ACCOUNTS.md, "Criação de Conta"). */
  account: AccountCardData | null;
};

/**
 * Modal único de criar/editar conta (FormModal padrão do handoff). Saldo
 * inicial pode ser editado também — o backend aceita (`updateAccountSchema`),
 * e retificar um valor inicial digitado errado é um caso de uso real.
 */
export function AccountFormModal({ open, onOpenChange, account }: AccountFormModalProps) {
  const isEditing = account !== null;

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>(AccountType.CHECKING);
  const [initialBalance, setInitialBalance] = useState("0");
  const [color, setColor] = useState<string>(DEFAULT_ACCOUNT_COLOR);
  const [icon, setIcon] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reidrata o formulário sempre que o modal abre (reset em edição/criação) —
   * "adjusting state when a prop changes" (react.dev/learn/you-might-not-need-an-effect),
   * feito durante o render (não em `useEffect`) pra não disparar setState
   * síncrono num efeito, mesmo padrão de `new-transaction-form.tsx`.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormError(null);
      setFieldErrors({});
      setName(account?.name ?? "");
      setType(account?.type ?? AccountType.CHECKING);
      setInitialBalance(account?.initialBalance ?? "0");
      setColor(account?.color ?? DEFAULT_ACCOUNT_COLOR);
      setIcon(account?.icon ?? null);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(name)) errors.name = "Nome é obrigatório.";
    if (!type) errors.type = "Selecione um tipo.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      // `icon` aceita `null` só no update (limpa o ícone escolhido antes);
      // `createAccountSchema` não é nullable, então na criação omitimos a
      // chave quando nada foi selecionado.
      const result = isEditing
        ? await updateAccountAction(account.id, { name, type, initialBalance, color, icon })
        : await createAccountAction({
            name,
            type,
            initialBalance,
            color,
            icon: icon ?? undefined,
          });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEditing ? "Conta atualizada" : "Conta criada");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar conta" : "Nova conta"}
      description="Contas representam o dinheiro real disponível — saldo é sempre calculado a partir das transações."
      size="tall"
      footer={
        <FormModalActions
          onCancel={() => onOpenChange(false)}
          submitForm="account-form"
          submitLabel="Salvar"
          isPending={isPending}
        />
      }
    >
      <form id="account-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Nome" htmlFor="account-name" required error={fieldErrors.name}>
          <Input
            id="account-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
            placeholder="Ex.: Conta corrente, Nubank…"
            aria-invalid={Boolean(fieldErrors.name)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField label="Tipo" htmlFor="account-type" required error={fieldErrors.type}>
          <EntitySelect
            id="account-type"
            options={ACCOUNT_TYPE_OPTIONS}
            value={type}
            onValueChange={(value) => {
              setType(value as AccountType);
              clearFieldError("type");
            }}
            placeholder="Selecione o tipo"
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.type)}
            className="w-full"
          />
        </FormField>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-initial-balance">Saldo inicial</Label>
          <CurrencyInput
            id="account-initial-balance"
            value={initialBalance}
            onValueChange={setInitialBalance}
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLOR_OPTIONS.map((option) => (
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

        <div className="flex flex-col gap-1.5">
          <Label>Ícone (opcional)</Label>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_ICON_OPTIONS.map((option) => {
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
      </form>
    </FormModal>
  );
}
