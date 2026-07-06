"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntitySelect } from "@/components/forms/entity-select";
import { CurrencyInput } from "@/components/forms/currency-input";
import { createAccountAction, updateAccountAction } from "@/modules/accounts/actions";
import { AccountType } from "@/generated/prisma/enums";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
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
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-name">Nome</Label>
          <Input
            id="account-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Conta corrente, Nubank…"
            required
            autoFocus
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-type">Tipo</Label>
          <EntitySelect
            id="account-type"
            options={ACCOUNT_TYPE_OPTIONS}
            value={type}
            onValueChange={(value) => setType(value as AccountType)}
            placeholder="Selecione o tipo"
            disabled={isPending}
            className="w-full"
          />
        </div>

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
                {color === option && <Check className="size-4 text-white" aria-hidden="true" />}
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
