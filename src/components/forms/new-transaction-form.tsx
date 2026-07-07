"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { DescriptionAutocomplete } from "@/components/forms/description-autocomplete";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { useShell } from "@/components/providers/shell-provider";
import { createTransactionAction, getLastCategoryByDescriptionAction } from "@/modules/transactions/actions";
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

/**
 * `YYYY-MM-DD` é comparável lexicograficamente — mesma regra determinística
 * de `isPaid` usada no Telegram (docs/30-TELEGRAM.md: "data resolvida > hoje
 * (America/Sao_Paulo) = previsto"), aqui aplicada no default do toggle
 * "Já paga" em vez de decidida no servidor.
 */
function isFutureDate(dateStr: string): boolean {
  return dateStr > toDateInputValueSaoPaulo();
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
  const [isPaid, setIsPaid] = useState(true);
  // `true` assim que o usuário mexe manualmente no toggle — a partir daí o
  // default automático (data futura → previsto) para de sobrescrever a
  // escolha explícita dele, mesmo que a data mude de novo.
  const [isPaidTouched, setIsPaidTouched] = useState(false);

  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [originOptions, setOriginOptions] = useState<EntitySelectOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
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
      setFieldErrors({});
      setType(initialType);
      setCategoryId(
        typeof window === "undefined"
          ? undefined
          : (window.localStorage.getItem(lastCategoryStorageKey(initialType)) ?? undefined),
      );
      setIsPaidTouched(false);
      setIsPaid(!isFutureDate(date));
    }
  }

  /**
   * Default do toggle "Já paga" reage a MUDANÇAS de data (mesmo padrão de
   * sync render-time acima) — nunca sobrescreve uma escolha manual já feita
   * (`isPaidTouched`). Data futura entra desligado (previsto/a pagar); ao
   * voltar pra hoje/passado, volta ligado (pago) — regra determinística de
   * `isPaid` (docs/30-TELEGRAM.md), aplicada aqui no default da UI em vez de
   * decidida no servidor.
   */
  const [lastDateForIsPaid, setLastDateForIsPaid] = useState(date);
  if (date !== lastDateForIsPaid) {
    setLastDateForIsPaid(date);
    if (!isPaidTouched) setIsPaid(!isFutureDate(date));
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
    setIsPaid(true);
    setIsPaidTouched(false);
  }

  /**
   * Bônus do autocomplete de Descrição (docs/20-TRANSACTIONS.md): ao escolher
   * uma sugestão, pré-preenche a categoria com a da transação mais recente
   * com essa descrição — só se ela bater com o tipo atual (Receita/Despesa),
   * pra nunca aplicar uma categoria do tipo errado por baixo do tabs ativo.
   */
  async function handleSelectDescriptionSuggestion(selectedDescription: string) {
    const result = await getLastCategoryByDescriptionAction(selectedDescription);
    if (result.success && result.data && result.data.type === categoryType) {
      setCategoryId(result.data.id);
      clearFieldError("categoryId");
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(amount)) errors.amount = "Informe um valor.";
    if (isBlank(description)) errors.description = "Descrição é obrigatória.";
    if (!categoryId) errors.categoryId = "Selecione uma categoria.";
    if (!origin) errors.origin = "Selecione a conta ou cartão de origem.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !categoryId || !origin) return;

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
        isPaid,
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

        <FormField label="Valor" htmlFor="tx-amount" required error={fieldErrors.amount}>
          <CurrencyInput
            id="tx-amount"
            value={amount}
            onValueChange={(value) => {
              setAmount(value);
              clearFieldError("amount");
            }}
            aria-invalid={Boolean(fieldErrors.amount)}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField label="Descrição" htmlFor="tx-description" required error={fieldErrors.description}>
          <DescriptionAutocomplete
            id="tx-description"
            value={description}
            onValueChange={(value) => {
              setDescription(value);
              clearFieldError("description");
            }}
            onSelectSuggestion={handleSelectDescriptionSuggestion}
            placeholder="Ex.: Mercado, Salário…"
            aria-invalid={Boolean(fieldErrors.description)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Categoria" htmlFor="tx-category" required error={fieldErrors.categoryId}>
          <EntitySelect
            id="tx-category"
            options={categoryOptions}
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              clearFieldError("categoryId");
            }}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a categoria"}
            disabled={isPending || loadingOptions}
            aria-invalid={Boolean(fieldErrors.categoryId)}
          />
        </FormField>

        <FormField label="Conta / Cartão" htmlFor="tx-origin" required error={fieldErrors.origin}>
          <EntitySelect
            id="tx-origin"
            options={originOptions}
            value={origin}
            onValueChange={(value) => {
              setOrigin(value as OriginValue);
              clearFieldError("origin");
            }}
            placeholder={loadingOptions ? "Carregando…" : "Selecione a origem"}
            disabled={isPending || loadingOptions}
            aria-invalid={Boolean(fieldErrors.origin)}
          />
        </FormField>

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

        <div className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2.5">
          <div>
            <Label htmlFor="tx-ispaid">Já paga</Label>
            <p className="text-[12px] font-medium text-muted-foreground">
              {isFutureDate(date)
                ? "Data futura entra como previsto (a pagar)."
                : "Desative se ainda não foi paga — ela entra como previsto/a pagar."}
            </p>
          </div>
          <Switch
            id="tx-ispaid"
            checked={isPaid}
            onCheckedChange={(checked) => {
              setIsPaid(checked);
              setIsPaidTouched(true);
            }}
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
