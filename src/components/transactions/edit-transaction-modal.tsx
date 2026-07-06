"use client";

import { useState, useTransition } from "react";
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
import { TagMultiSelect } from "./tag-multi-select";
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
  const isCardPayment = transaction?.type === TransactionType.CARD_PAYMENT;

  const [type, setType] = useState<EditableType>(TransactionType.EXPENSE);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [origin, setOrigin] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(toDateInputValueSaoPaulo());
  const [notes, setNotes] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
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
      setOrigin(
        transaction.accountId ? `account:${transaction.accountId}` : transaction.cardId ? `card:${transaction.cardId}` : undefined,
      );
      setDate(toDateInputValueSaoPaulo(transaction.date));
      setNotes(transaction.notes ?? "");
      setIsPaid(transaction.isPaid);
      setTagIds(transaction.transactionTags.map((tag) => tag.tagId));
      setFormError(null);
    }
  }

  const categoryOptions = referenceData.categoryOptions.filter(
    (option) => option.group === (type === TransactionType.INCOME ? "Receita" : "Despesa"),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!transaction) return;
    setFormError(null);

    if (!isCardPayment && !categoryId) {
      setFormError("Selecione uma categoria.");
      return;
    }
    if (!origin) {
      setFormError("Selecione a conta ou cartão de origem.");
      return;
    }

    const [originKind, originId] = origin.split(":") as ["account" | "card", string];

    startTransition(async () => {
      const result = await updateTransactionAction(transaction.id, {
        description,
        amount,
        ...(isCardPayment ? {} : { type, categoryId }),
        accountId: originKind === "account" ? originId : null,
        cardId: originKind === "card" ? originId : null,
        date,
        notes: notes.trim() || null,
        isPaid,
        tagIds,
      });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-tx-amount">Valor</Label>
          <CurrencyInput id="edit-tx-amount" value={amount} onValueChange={setAmount} required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-tx-description">Descrição</Label>
          <Input
            id="edit-tx-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            disabled={isPending}
          />
        </div>

        {!isCardPayment && (
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <EntitySelect
              options={categoryOptions}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Selecione a categoria"
              disabled={isPending || referenceData.loading}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Conta / Cartão</Label>
          <EntitySelect
            options={referenceData.originOptions}
            value={origin}
            onValueChange={setOrigin}
            placeholder="Selecione a origem"
            disabled={isPending || referenceData.loading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-tx-date">Data</Label>
          <DateField id="edit-tx-date" value={date} onValueChange={setDate} disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Tags</Label>
          <TagMultiSelect tags={referenceData.tags} value={tagIds} onValueChange={setTagIds} disabled={isPending} />
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

        <div className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2.5">
          <div>
            <Label htmlFor="edit-tx-ispaid">Já paga</Label>
            <p className="text-[12px] font-medium text-muted-foreground">
              Desligue para lançamentos previstos ainda não liquidados.
            </p>
          </div>
          <Switch id="edit-tx-ispaid" checked={isPaid} onCheckedChange={setIsPaid} disabled={isPending} />
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
