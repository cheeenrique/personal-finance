"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Tag, Trash2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { EmptyState } from "@/components/shared/empty-state";
import { IconActionButton } from "@/components/shared/icon-action-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createMerchantRuleAction, deleteMerchantRuleAction } from "@/modules/merchant-rules/actions";
import type { MerchantCategoryRule } from "@/modules/merchant-rules/types";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { CategoryType } from "@/generated/prisma/enums";
import { notifyError, notifySuccess } from "@/lib/toast";

type MerchantRulesCardProps = {
  initialRules: MerchantCategoryRule[];
  categoryTree: CategoryTreeNode[];
};

/**
 * Achata a árvore em opções indentadas, só categorias EXPENSE (regra de
 * override só faz sentido pra despesa) — mesmo padrão de
 * `budgets/budget-form-modal.tsx`/`forms/new-transaction-form.tsx` (2ª+
 * ocorrência aceita, rule 02-dry-kiss-yagni: "3 ocorrências = extrair").
 */
function flattenExpenseCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes
    .filter((node) => node.type === CategoryType.EXPENSE)
    .flatMap((node) => [
      { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
      ...flattenExpenseCategories(node.children, depth + 1),
    ]);
}

/** Mapa id→nome de TODA a árvore (não só EXPENSE) — exibição da lista precisa resolver o nome mesmo se a categoria mudar de tipo depois. */
function buildCategoryNameMap(nodes: CategoryTreeNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    map.set(node.id, node.name);
    for (const [id, name] of buildCategoryNameMap(node.children)) map.set(id, name);
  }
  return map;
}

/**
 * Regras de override merchant→categoria (docs/superpowers/specs/
 * 2026-07-08-telegram-recibo-categoria-refino-design.md, Parte 1): quando a
 * descrição de um lançamento (Telegram ou importação) contém o `pattern`
 * cadastrado aqui, a categoria da regra GANHA da sugestão da IA e do
 * histórico. CRUD simples — criar/listar/excluir, sem edição (excluir +
 * recriar cobre trocar de categoria).
 */
export function MerchantRulesCard({ initialRules, categoryTree }: MerchantRulesCardProps) {
  const [rules, setRules] = useState(initialRules);
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [deletingRule, setDeletingRule] = useState<MerchantCategoryRule | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();

  const categoryOptions = useMemo(() => flattenExpenseCategories(categoryTree), [categoryTree]);
  const categoryNameById = useMemo(() => buildCategoryNameMap(categoryTree), [categoryTree]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const errors: Record<string, string> = {};
    if (isBlank(pattern)) errors.pattern = "Informe o texto do estabelecimento.";
    if (!categoryId) errors.categoryId = "Selecione uma categoria.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const result = await createMerchantRuleAction({ pattern, categoryId });
    setSubmitting(false);

    if (!result.success) {
      notifyError(result.error.message);
      return;
    }

    setRules((previous) => [...previous, result.data]);
    setPattern("");
    setCategoryId(undefined);
    notifySuccess("Regra criada");
  }

  async function handleDelete() {
    if (!deletingRule) return;

    const result = await deleteMerchantRuleAction(deletingRule.id);
    if (!result.success) {
      notifyError(result.error.message);
      setDeletingRule(null);
      return;
    }

    setRules((previous) => previous.filter((rule) => rule.id !== deletingRule.id));
    notifySuccess("Regra excluída");
    setDeletingRule(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras de categoria</CardTitle>
        <CardDescription>
          Quando a descrição de um lançamento contém este texto, a categoria abaixo é aplicada
          automaticamente — ganhando da sugestão da IA e do histórico.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <FormField
              label="Texto do estabelecimento"
              htmlFor="merchant-rule-pattern"
              required
              error={fieldErrors.pattern}
            >
              <Input
                id="merchant-rule-pattern"
                value={pattern}
                onChange={(event) => {
                  setPattern(event.target.value);
                  clearFieldError("pattern");
                }}
                placeholder="ex.: eldora"
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.pattern)}
              />
            </FormField>
          </div>

          <div className="flex-1">
            <FormField
              label="Categoria"
              htmlFor="merchant-rule-category"
              required
              error={fieldErrors.categoryId}
            >
              <EntitySelect
                id="merchant-rule-category"
                options={categoryOptions}
                value={categoryId}
                onValueChange={(value) => {
                  setCategoryId(value);
                  clearFieldError("categoryId");
                }}
                placeholder="Selecione a categoria"
                emptyMessage="Nenhuma categoria de despesa cadastrada."
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.categoryId)}
              />
            </FormField>
          </div>

          <Button type="submit" disabled={isSubmitting} className="sm:mt-6.5 sm:w-fit">
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            <Plus className="size-4" aria-hidden="true" />
            Adicionar
          </Button>
        </form>

        {rules.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Nenhuma regra cadastrada"
            description="Crie uma regra para forçar a categoria de um estabelecimento específico, mesmo com histórico ambíguo."
          />
        ) : (
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{rule.pattern}</p>
                <Badge variant="outline">{categoryNameById.get(rule.categoryId) ?? "Categoria removida"}</Badge>
                <IconActionButton
                  icon={Trash2}
                  tone="danger"
                  label={`Excluir regra "${rule.pattern}"`}
                  onClick={() => setDeletingRule(rule)}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={deletingRule !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRule(null);
        }}
        title={`Excluir regra "${deletingRule?.pattern ?? ""}"?`}
        description="Lançamentos futuros com esse texto na descrição voltam a usar a sugestão da IA ou o histórico."
        onConfirm={handleDelete}
      />
    </Card>
  );
}
