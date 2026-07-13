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
 * Status (vencimento/paga/atrasada) da última fatura FECHADA — ver
 * `service.ts` `lastClosedInvoiceStatus` e o design doc
 * `docs/superpowers/specs/2026-07-13-cartao-vencimento-fatura-status-design.md`.
 */
export type InvoiceStatus = {
  invoice: Invoice;
  paidAmount: Money;
  isPaid: boolean;
  isOverdue: boolean;
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
 *   gastos, ver `computeMealBalance`); `mealRecharged`/`mealSpent` trazem os
 *   dois lados desse cálculo separados — a UI usa os dois pra desenhar a
 *   barra `gasto / recarga` (mesmo componente da barra `usado / limite` do
 *   CREDIT).
 * - `lastInvoiceDueDate`/`lastInvoiceIsPaid`/`lastInvoiceIsOverdue`: status da
 *   ÚLTIMA FATURA FECHADA (distinta de `invoiceDueDate`, que é o ciclo ABERTO
 *   em formação — ver "achado central" no design doc
 *   `docs/superpowers/specs/2026-07-13-cartao-vencimento-fatura-status-design.md`).
 *   `null` para MEAL, para cartão que ainda não completou nenhum ciclo desde
 *   a criação, ou quando a fatura fechada não teve nenhuma compra (`total=0`
 *   — a UI esconde a faixa de vencimento nesse caso, Premissa 3 do design
 *   doc). `isPaid` é heurística por janela de data de `CARD_PAYMENT` (sem
 *   coluna que ligue pagamento a invoice/período — Premissa 1 do design doc).
 */
export type CardWithSummary = Card & {
  currentInvoiceTotal: Money;
  outstandingBalance: Money;
  availableLimit: Money;
  invoiceDueDate: Date;
  /** `null` para CREDIT. Saldo (recargas − gastos) para MEAL — ver `service.ts` `computeMealBalance`. */
  mealBalance: Money | null;
  /** `null` para CREDIT. Total recarregado (Σ INCOME isPaid) para MEAL — "total" da barra `gasto / recarga`. */
  mealRecharged: Money | null;
  /** `null` para CREDIT. Total gasto (Σ EXPENSE isPaid) para MEAL — "usado" da barra `gasto / recarga`. */
  mealSpent: Money | null;
  /** Vencimento da última fatura FECHADA (aguardando pagamento). `null` quando não há fatura anterior aplicável — ver doc do tipo acima. */
  lastInvoiceDueDate: Date | null;
  /** `paidAmount >= total` da última fatura fechada (heurística por janela de data). `null` junto com `lastInvoiceDueDate`. */
  lastInvoiceIsPaid: boolean | null;
  /** `!isPaid && hoje (SP) > lastInvoiceDueDate` (estritamente depois — o próprio dia do vencimento ainda não é atraso). `null` junto com `lastInvoiceDueDate`. */
  lastInvoiceIsOverdue: boolean | null;
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
