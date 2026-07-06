"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { useShell } from "@/components/providers/shell-provider";
import { createTransactionAction } from "@/modules/transactions/actions";
import { listAccountOptionsAction, listCardOptionsAction } from "@/components/shared/entity-options-actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { TransactionType, CategoryType } from "@/generated/prisma/enums";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";
import { notifySuccess } from "@/lib/toast";

const QUICK_TYPES = [
  { value: TransactionType.EXPENSE, label: "Despesa", icon: TrendingDown },
  { value: TransactionType.INCOME, label: "Receita", icon: TrendingUp },
] as const;

type OriginValue = `account:${string}` | `card:${string}`;

function lastCategoryStorageKey(type: TransactionType) {
  return `pf:last-category:${type}`;
}

function flattenCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenCategories(node.children, depth + 1),
  ]);
}

/**
 * Modal de Nova Transação — a ação mais frequente do sistema
 * (docs/05-UX_RULES.md, "Nova Transação"). Restrita a Receita/Despesa aqui:
 * Transferência e Pagamento de fatura usam schemas/fluxos próprios
 * (`modules/accounts/transfer.ts`, `modules/cards/pay-invoice.ts`) e ganham
 * telas dedicadas na fase de screens (`/accounts`, `/cards`).
 */
export function NewTransactionForm() {
  const { isTransactionModalOpen, transactionModalDefaultType, closeTransactionModal } =
    useShell();

  const initialType =
    transactionModalDefaultType === TransactionType.INCOME
      ? TransactionType.INCOME
      : TransactionType.EXPENSE;

  const [type, setType] = useState<TransactionType>(initialType);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [origin, setOrigin] = useState<OriginValue | undefined>(undefined);
  const [date, setDate] = useState(toDateInputValueSaoPaulo());
  const [notes, setNotes] = useState("");

  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [originOptions, setOriginOptions] = useState<EntitySelectOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Reset de tipo/categoria ao reabrir o modal — "adjusting state when a
   * prop changes" (react.dev/learn/you-might-not-need-an-effect), feito
   * durante o render (não em `useEffect`) pra não disparar setState síncrono
   * num efeito. Como isso só roda em reação a uma interação do usuário
   * (abrir o modal), nunca durante SSR/hidratação, ler `localStorage` aqui é
   * seguro (o branch é inatingível no primeiro render server/client).
   */
  const [wasOpen, setWasOpen] = useState(isTransactionModalOpen);
  if (isTransactionModalOpen !== wasOpen) {
    setWasOpen(isTransactionModalOpen);
    if (isTransactionModalOpen) {
      setType(initialType);
      setCategoryId(
        typeof window === "undefined"
          ? undefined
          : (window.localStorage.getItem(lastCategoryStorageKey(initialType)) ?? undefined),
      );
    }
  }

  // Busca categorias/contas/cartões (Server Actions) só quando o modal abre —
  // efeito legítimo: sincroniza com um sistema externo, setState acontece
  // dentro do callback assíncrono (`.then`/`.finally`), não síncrono no corpo.
  useEffect(() => {
    if (!isTransactionModalOpen) return;

    Promise.resolve()
      .then(() => {
        setFormError(null);
        setLoadingOptions(true);
        return Promise.all([listCategoryTreeAction(), listAccountOptionsAction(), listCardOptionsAction()]);
      })
      .then(([categoryResult, accountResult, cardResult]) => {
        if (categoryResult.success) setCategories(categoryResult.data);

        const accountOptions: EntitySelectOption[] = accountResult.success
          ? accountResult.data.map((account) => ({
              value: `account:${account.id}`,
              label: account.name,
              group: "Contas",
            }))
          : [];
        const cardOptions: EntitySelectOption[] = cardResult.success
          ? cardResult.data.map((card) => ({
              value: `card:${card.id}`,
              label: card.name,
              group: "Cartões",
            }))
          : [];
        setOriginOptions([...accountOptions, ...cardOptions]);
      })
      .finally(() => setLoadingOptions(false));
  }, [isTransactionModalOpen]);

  const categoryType: CategoryType =
    type === TransactionType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE;
  const categoryOptions = flattenCategories(
    categories.filter((node) => node.type === categoryType),
  );

  function resetForm() {
    setDescription("");
    setAmount("");
    setOrigin(undefined);
    setNotes("");
    setDate(toDateInputValueSaoPaulo());
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!categoryId) {
      setFormError("Selecione uma categoria.");
      return;
    }
    if (!origin) {
      setFormError("Selecione a conta ou cartão de origem.");
      return;
    }

    const [originKind, originId] = origin.split(":") as ["account" | "card", string];

    startTransition(async () => {
      const result = await createTransactionAction({
        description,
        amount,
        type,
        categoryId,
        accountId: originKind === "account" ? originId : undefined,
        cardId: originKind === "card" ? originId : undefined,
        date,
        notes: notes.trim() || undefined,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      if (categoryId) {
        window.localStorage.setItem(lastCategoryStorageKey(type), categoryId);
      }
      notifySuccess("Transação salva");
      resetForm();
      closeTransactionModal();
    });
  }

  return (
    <FormModal
      open={isTransactionModalOpen}
      onOpenChange={(open) => {
        if (!open) closeTransactionModal();
      }}
      title="Nova transação"
      description="Registre uma receita ou despesa em poucos campos."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {QUICK_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-[10px] border text-sm font-bold transition-colors",
                type === option.value
                  ? option.value === TransactionType.INCOME
                    ? "border-success bg-success/16 text-success"
                    : "border-destructive bg-destructive/16 text-destructive"
                  : "border-border text-muted-foreground",
              )}
            >
              <option.icon className="size-4" aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-amount">Valor</Label>
          <CurrencyInput
            id="tx-amount"
            value={amount}
            onValueChange={setAmount}
            autoFocus
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-description">Descrição</Label>
          <Input
            id="tx-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Mercado, Salário…"
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Categoria</Label>
          <EntitySelect
            options={categoryOptions}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a categoria"}
            disabled={isPending || loadingOptions}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Conta / Cartão</Label>
          <EntitySelect
            options={originOptions}
            value={origin}
            onValueChange={(value) => setOrigin(value as OriginValue)}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a origem"}
            disabled={isPending || loadingOptions}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-date">Data</Label>
          <DateField id="tx-date" value={date} onValueChange={setDate} disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-notes">Observações (opcional)</Label>
          <Textarea
            id="tx-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais…"
            disabled={isPending}
          />
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={closeTransactionModal}
            disabled={isPending}
          >
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
