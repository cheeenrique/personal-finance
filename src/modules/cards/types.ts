import type { Card, CardInvoice, Prisma } from "@/generated/prisma/client";
import type { CardType } from "@/generated/prisma/enums";

export type { Card, CardInvoice, CardType };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/** Uma compra (EXPENSE, incluindo parcela) dentro do ciclo de uma fatura. */
export type InvoiceItem = {
  id: string;
  description: string;
  amount: Money;
  date: Date;
  installmentNumber: number | null;
  installmentPurchaseId: string | null;
};

/** Fatura calculada dinamicamente para um ciclo (docs/22-CREDIT_CARDS.md, "Lógica de Fatura"). */
export type Invoice = {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  total: Money;
  items: InvoiceItem[];
};

/**
 * Card + resumo derivado — ver service.ts `listWithSummary`.
 *
 * Shape único (não discriminado) de propósito: esta task é só backend
 * (schema + módulo cards) — uma union discriminada por `type` quebraria a
 * UI de listagem hoje (`/cards`: `cards-grid.tsx`/`card-tile.tsx`/
 * `card-detail-view.tsx`/`card-form-modal.tsx`, todos tipados em cima do
 * `CardWithSummary` "achatado" atual), forçando a UI mexer nesta mesma
 * entrega. Fica pro próximo passo (UI) migrar pra um shape discriminado se
 * fizer sentido quando a tela de cartão MEAL for desenhada.
 *
 * - CREDIT: `currentInvoiceTotal`/`outstandingBalance`/`availableLimit`/
 *   `invoiceDueDate` calculados por ciclo (docs/22-CREDIT_CARDS.md, fluxo
 *   INTACTO); `mealBalance=null`.
 * - MEAL: os 4 campos CREDIT acima não têm significado (docs/22 não cobre
 *   este tipo) — vêm com placeholder neutro (zero / `refDate`, ver
 *   `service.ts` `listWithSummary`), nunca consumidos por UI hoje (nenhum
 *   cartão MEAL existe ainda). `mealBalance` traz o saldo real (recargas −
 *   gastos, ver `computeMealBalance`).
 */
export type CardWithSummary = Card & {
  currentInvoiceTotal: Money;
  outstandingBalance: Money;
  availableLimit: Money;
  invoiceDueDate: Date;
  /** `null` para CREDIT. Saldo (recargas − gastos) para MEAL — ver `service.ts` `computeMealBalance`. */
  mealBalance: Money | null;
};

export type PayInvoiceResult = {
  transactionId: string;
  cardId: string;
  accountId: string;
  amount: Money;
  date: Date;
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
