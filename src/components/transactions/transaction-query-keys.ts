import type { QueryClient } from "@tanstack/react-query";

/**
 * Todo prefixo de `queryKey` (TanStack Query) que lista transações em algum
 * lugar do app — `use-transactions-list.ts` (`/transactions`),
 * `use-account-transactions-list.ts` (`/accounts/[id]`),
 * `use-card-transactions-list.ts` (cartão MEAL) e `use-invoice-items-list.ts`
 * (fatura CREDIT). Cada hook já invalida o próprio prefixo via `reload()`
 * quando a mutation acontece NA MESMA tela onde ele está montado — mas o
 * modal global de Nova Transação (`NewTransactionForm`, aberto de qualquer
 * página via `useShell().openTransactionModal`) e o
 * `EditTransactionModal`/`useTransactionMutations` (reaproveitados em telas
 * diferentes de onde a transação pode também listar — ex.: editar em
 * `/transactions` uma linha que também aparece em `/accounts/[id]`) não têm
 * como saber qual tela está montada. Por isso invalidam TODOS os prefixos
 * abaixo, não só o da tela atual — sem isso a tabela some fica com cache
 * velho até um F5 (revalidatePath do server action só alcança os RSC, não
 * este cache client-side).
 *
 * Se um novo hook de listagem de transações for criado, adicionar o prefixo
 * aqui também.
 */
const TRANSACTION_LIST_QUERY_KEY_PREFIXES = [
  ["transactions"],
  ["account-transactions"],
  ["card-transactions"],
  ["invoice-items"],
] as const;

/**
 * Invalida o cache client-side de TODAS as listagens de transações — chamar
 * depois de criar/editar/excluir/desfazer uma transação a partir de um ponto
 * de entrada global (modal do shell) ou compartilhado entre telas
 * (`EditTransactionModal`, `useTransactionMutations`).
 */
export function invalidateAllTransactionLists(queryClient: QueryClient): void {
  for (const queryKey of TRANSACTION_LIST_QUERY_KEY_PREFIXES) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
