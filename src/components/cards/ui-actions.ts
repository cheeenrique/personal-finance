"use server";

import { createCardAction, updateCardAction, payInvoiceAction } from "@/modules/cards/actions";
import { listAccountsAction } from "@/modules/accounts/actions";
import type { ActionResult } from "@/modules/cards/types";

/**
 * Adaptador de fronteira client/server — NÃO é lógica de domínio (essa
 * continua 100% em `modules/cards`/`modules/accounts`, fora do escopo desta
 * tela). As Server Actions originais retornam `Prisma.Decimal` (Card.limit,
 * Invoice.total, PayInvoiceResult.amount etc.), que não é serializável na
 * volta pro Client Component que a invoca (React Flight só aceita objeto
 * plano + poucos built-ins — Date passa, classes como `Decimal` não, ver
 * node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md,
 * "serializable"). Estes wrappers só descartam/achatam os campos que o
 * client não pode receber; toda validação e regra de negócio permanece nas
 * actions originais, chamadas aqui sem alteração.
 */

export type PayerAccountOption = { id: string; name: string };

export async function createCardForClient(input: unknown): Promise<ActionResult<null>> {
  const result = await createCardAction(input);
  return result.success ? { success: true, data: null } : result;
}

export async function updateCardForClient(id: string, input: unknown): Promise<ActionResult<null>> {
  const result = await updateCardAction(id, input);
  return result.success ? { success: true, data: null } : result;
}

export async function payInvoiceForClient(input: unknown): Promise<ActionResult<null>> {
  const result = await payInvoiceAction(input);
  return result.success ? { success: true, data: null } : result;
}

/** Contas pagadoras pro EntitySelect de "Pagar fatura" — só id/nome, nunca o saldo (Decimal) da conta. */
export async function listPayerAccountsForClient(): Promise<ActionResult<PayerAccountOption[]>> {
  const result = await listAccountsAction();
  if (!result.success) return result;
  return {
    success: true,
    data: result.data.map((account) => ({ id: account.id, name: account.name })),
  };
}
