"use server";

import { listAccountsAction } from "@/modules/accounts/actions";
import { listCardsAction } from "@/modules/cards/actions";
import type { ActionResult } from "@/modules/accounts/types";

/**
 * Adaptador de fronteira client/server — NÃO é lógica de domínio (mesma
 * lógica de `components/cards/ui-actions.ts`, "Adaptador de fronteira
 * client/server"). `listAccountsAction`/`listCardsAction` retornam
 * `Prisma.Decimal` (`Account.initialBalance`/`balance`,
 * `Card.limit`/`currentInvoiceTotal`/etc.), que não sobrevive à serialização
 * de volta pro Client Component que os invoca (React Flight só aceita
 * objeto plano + poucos built-ins — Decimal não, ver
 * node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md,
 * "serializable"). Usado por telas que só precisam do nome pra
 * exibir/filtrar (dropdowns, mapas id→nome), nunca do saldo/limite.
 */

export type EntityOption = { id: string; name: string };

export async function listAccountOptionsAction(): Promise<ActionResult<EntityOption[]>> {
  const result = await listAccountsAction();
  if (!result.success) return result;
  return { success: true, data: result.data.map((account) => ({ id: account.id, name: account.name })) };
}

export async function listCardOptionsAction(): Promise<ActionResult<EntityOption[]>> {
  const result = await listCardsAction();
  if (!result.success) return result;
  return { success: true, data: result.data.map((card) => ({ id: card.id, name: card.name })) };
}
