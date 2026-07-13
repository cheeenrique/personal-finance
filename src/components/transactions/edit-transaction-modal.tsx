"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/forms/currency-input";
import { DateField } from "@/components/forms/date-field";
import { EntitySelect } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { TagMultiSelect } from "./tag-multi-select";
import { invalidateAllTransactionLists } from "./transaction-query-keys";
import { isCardTransaction } from "./use-transaction-mutations";
import type { TransactionsReferenceData } from "./use-transactions-reference-data";
import { updateTransactionAction } from "@/modules/transactions/actions";
import type { ClientTransaction } from "@/modules/transactions/types";
import { TransactionType } from "@/generated/prisma/enums";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";
import { notifySuccess } from "@/lib/toast";

const EDITABLE_TYPES = [
  { value: TransactionType.EXPENSE, label: "Despesa", icon: TrendingDown },
  { value: TransactionType.INCOME, label: "Receita", icon: TrendingUp },
] as const;

type EditableType = (typeof EDITABLE_TYPES)[number]["value"];

type EditTransactionModalProps = {
  transaction: ClientTransaction | null;
  onOpenChange: (open: boolean) => void;
  referenceData: TransactionsReferenceData;
  onSaved: () => void;
};

/**
 * Edição de transação — mesmos campos do `NewTransactionForm` + `isPaid` e
 * tags (docs/06-SCREENS.md, "Transações": "todos os campos... usando
 * updateTransactionAction"). Restrita a INCOME/EXPENSE/CARD_PAYMENT — TRANSFER
 * nunca chega aqui (ação de editar fica desabilitada na tabela pra essas
 * linhas, ver `transactions-view.tsx`: sem propagação de perna implementada
 * no módulo `accounts/transfer.ts` ainda).
 */
export function EditTransactionModal({ transaction, onOpenChange, referenceData, onSaved }: EditTransactionModalProps) {
  const queryClient = useQueryClient();
  const isCardPayment = transaction?.type === TransactionType.CARD_PAYMENT;
  /** Cartão não tem o switch "já paga" — cobrança é confirmada na compra, quem paga é a fatura (ver JSDoc de `isCardTransaction`, decisão confirmada pelo dono do produto). */
  const hideIsPaidToggle = Boolean(transaction && isCardTransaction(transaction));

  const [type, setType] = useState<EditableType>(TransactionType.EXPENSE);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [origin, setOrigin] = useState<string | undefined>(undefined);
  /**
   * `CARD_PAYMENT` não pode fundir conta+cartão num único `origin` — precisa
   * dos dois IDs ao mesmo tempo (docs/22-CREDIT_CARDS.md:145-149, ver JSDoc
   * de `assertSourceAndCategoryInvariant` em `modules/transactions/service.ts`).
   * Estado dedicado, populado direto de `transaction.accountId`/`cardId`.
   */
  const [cardPaymentAccountId, setCardPaymentAccountId] = useState<string | undefined>(undefined);
  const [cardPaymentCardId, setCardPaymentCardId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(toDateInputValueSaoPaulo());
  const [notes, setNotes] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Popula o form sempre que uma nova transação é aberta pra edição —
   * "adjusting state when a prop changes" (react.dev/learn/you-might-not-need-an-effect),
   * feito durante o render (não em `useEffect`, mesmo padrão do
   * `NewTransactionForm`) pra não disparar setState síncrono num efeito.
   */
  const [lastTransaction, setLastTransaction] = useState(transaction);
  if (transaction !== lastTransaction) {
    setLastTransaction(transaction);
    if (transaction) {
      setType(transaction.type === TransactionType.INCOME ? TransactionType.INCOME : TransactionType.EXPENSE);
      setDescription(transaction.description);
      setAmount(transaction.amount);
      setCategoryId(transaction.categoryId ?? undefined);
      if (transaction.type === TransactionType.CARD_PAYMENT) {
        setCardPaymentAccountId(transaction.accountId ?? undefined);
        setCardPaymentCardId(transaction.cardId ?? undefined);
        setOrigin(undefined);
      } else {
        setOrigin(
          transaction.accountId ? `account:${transaction.accountId}` : transaction.cardId ? `card:${transaction.cardId}` : undefined,
        );
        setCardPaymentAccountId(undefined);
        setCardPaymentCardId(undefined);
      }
      setDate(toDateInputValueSaoPaulo(transaction.date));
      setNotes(transaction.notes ?? "");
      setIsPaid(transaction.isPaid);
      setTagIds(transaction.transactionTags.map((tag) => tag.tagId));
      setFormError(null);
      setFieldErrors({});
    }
  }

  const categoryOptions = referenceData.categoryOptions.filter(
    (option) => option.group === (type === TransactionType.INCOME ? "Receita" : "Despesa"),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!transaction) return;
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(amount)) errors.amount = "Informe um valor.";
    if (isBlank(description)) errors.description = "Descrição é obrigatória.";
    if (!isCardPayment && !categoryId) errors.categoryId = "Selecione uma categoria.";
    if (isCardPayment) {
      if (!cardPaymentAccountId) errors.accountId = "Selecione a conta pagadora.";
      if (!cardPaymentCardId) errors.cardId = "Selecione o cartão da fatura.";
    } else if (!origin) {
      errors.origin = "Selecione a conta ou cartão de origem.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // `CARD_PAYMENT` exige os dois IDs simultâneos — enviados DIRETO, sem
    // passar pelo split de `origin` (que só carrega um dos dois e é a causa
    // raiz do bug de `cardId` zerado no submit, ver spec).
    const source = isCardPayment
      ? { accountId: cardPaymentAccountId ?? null, cardId: cardPaymentCardId ?? null }
      : (() => {
          const [originKind, originId] = origin!.split(":") as ["account" | "card", string];
          return {
            accountId: originKind === "account" ? originId : null,
            cardId: originKind === "card" ? originId : null,
          };
        })();

    startTransition(async () => {
      const result = await updateTransactionAction(transaction.id, {
        description,
        amount,
        ...(isCardPayment ? {} : { type, categoryId }),
        ...source,
        date,
        notes: notes.trim() || null,
        isPaid,
        tagIds,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      // Este modal é reaproveitado em telas diferentes de onde a transação
      // pode também listar (ex.: editar em `/transactions` uma linha que
      // também aparece em `/accounts/[id]`) — invalida todas as listagens
      // client-side, não só a da tela atual (`transaction-query-keys.ts`).
      invalidateAllTransactionLists(queryClient);
      notifySuccess("Transação atualizada");
      onSaved();
    });
  }

  return (
    <FormModal
      open={Boolean(transaction)}
      onOpenChange={onOpenChange}
      title="Editar transação"
      description="Altere os dados e salve — a listagem atualiza na hora."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isCardPayment ? (
          <p className="rounded-[10px] border border-border bg-muted/50 px-3 py-2 text-sm font-semibold text-muted-foreground">
            Pagamento de fatura — tipo e categoria não são editáveis.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {EDITABLE_TYPES.map((option) => (
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
        )}

        <FormField label="Valor" htmlFor="edit-tx-amount" required error={fieldErrors.amount}>
          <CurrencyInput
            id="edit-tx-amount"
            value={amount}
            onValueChange={(value) => {
              setAmount(value);
              clearFieldError("amount");
            }}
            aria-invalid={Boolean(fieldErrors.amount)}
            disabled={isPending}
          />
        </FormField>

        <FormField label="Descrição" htmlFor="edit-tx-description" required error={fieldErrors.description}>
          <Input
            id="edit-tx-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              clearFieldError("description");
            }}
            aria-invalid={Boolean(fieldErrors.description)}
            disabled={isPending}
          />
        </FormField>

        {!isCardPayment && (
          <FormField label="Categoria" htmlFor="edit-tx-category" required error={fieldErrors.categoryId}>
            <EntitySelect
              id="edit-tx-category"
              options={categoryOptions}
              value={categoryId}
              onValueChange={(value) => {
                setCategoryId(value);
                clearFieldError("categoryId");
              }}
              placeholder="Selecione a categoria"
              disabled={isPending || referenceData.loading}
              aria-invalid={Boolean(fieldErrors.categoryId)}
            />
          </FormField>
        )}

        {isCardPayment ? (
          <>
            <FormField label="Conta pagadora" htmlFor="edit-tx-account" required error={fieldErrors.accountId}>
              <EntitySelect
                id="edit-tx-account"
                options={referenceData.accountOptions}
                value={cardPaymentAccountId}
                onValueChange={(value) => {
                  setCardPaymentAccountId(value);
                  clearFieldError("accountId");
                }}
                placeholder="Selecione a conta"
                disabled={isPending || referenceData.loading}
                aria-invalid={Boolean(fieldErrors.accountId)}
              />
            </FormField>

            <FormField label="Cartão" htmlFor="edit-tx-card" required error={fieldErrors.cardId}>
              <EntitySelect
                id="edit-tx-card"
                options={referenceData.cardOptions}
                value={cardPaymentCardId}
                onValueChange={(value) => {
                  setCardPaymentCardId(value);
                  clearFieldError("cardId");
                }}
                placeholder="Selecione o cartão"
                disabled={isPending || referenceData.loading}
                aria-invalid={Boolean(fieldErrors.cardId)}
              />
            </FormField>
          </>
        ) : (
          <FormField label="Conta / Cartão" htmlFor="edit-tx-origin" required error={fieldErrors.origin}>
            <EntitySelect
              id="edit-tx-origin"
              options={referenceData.originOptions}
              value={origin}
              onValueChange={(value) => {
                setOrigin(value);
                clearFieldError("origin");
              }}
              placeholder="Selecione a origem"
              disabled={isPending || referenceData.loading}
              aria-invalid={Boolean(fieldErrors.origin)}
            />
          </FormField>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-tx-date">Data</Label>
          <DateField id="edit-tx-date" value={date} onValueChange={setDate} disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-tx-tags">Tags</Label>
          <TagMultiSelect
            id="edit-tx-tags"
            tags={referenceData.tags}
            value={tagIds}
            onValueChange={setTagIds}
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-tx-notes">Observações</Label>
          <Textarea
            id="edit-tx-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isPending}
          />
        </div>

        {hideIsPaidToggle ? (
          <div className="rounded-[10px] border border-border px-3 py-2.5">
            <p className="text-sm font-bold text-foreground">Pago via fatura</p>
            <p className="text-[12px] font-medium text-muted-foreground">
              Cobrança de cartão é sempre confirmada — o pagamento acontece no nível da fatura, não desta linha.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="edit-tx-ispaid">Já paga</Label>
              <p className="text-[12px] font-medium text-muted-foreground">
                Desative se ainda não foi paga — ela entra como previsto/a pagar.
              </p>
            </div>
            <Switch id="edit-tx-ispaid" checked={isPaid} onCheckedChange={setIsPaid} disabled={isPending} />
          </div>
        )}

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
