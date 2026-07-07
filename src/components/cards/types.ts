import type { CardType } from "@/modules/cards/types";

/**
 * Tipos "view" do módulo Cartões — versões serializáveis (Decimal → string,
 * Date → ISO string) dos tipos de `modules/cards/types.ts`. Necessário
 * porque `Prisma.Decimal` não é um tipo serializável entre Server e Client
 * Components (React Flight só aceita objeto plano + poucos built-ins; Date
 * passa, classes como `Decimal` não — ver
 * node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md,
 * "serializable"). Ver `serialize.ts` para os mappers.
 */

export type CardSummaryView = {
  id: string;
  name: string;
  brand: string;
  /** Imutável após a criação (ver `modules/cards/schemas.ts` `updateCardSchema`) — decide o branch CREDIT/MEAL na UI (tile, detalhe, form). */
  type: CardType;
  limit: string;
  closingDay: number;
  dueDay: number;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  createdAt: string;
  currentInvoiceTotal: string;
  outstandingBalance: string;
  availableLimit: string;
  invoiceDueDate: string;
  /** `null` para CREDIT. Saldo (recargas − gastos) para MEAL — ver `modules/cards/service.ts` `computeMealBalance`. */
  mealBalance: string | null;
  /** `null` para CREDIT. Total recarregado (Σ INCOME) para MEAL — "total" da barra `gasto / recarga` (mesmo padrão da barra `usado / limite` do CREDIT). */
  mealRecharged: string | null;
  /** `null` para CREDIT. Total gasto (Σ EXPENSE) para MEAL — "usado" da barra `gasto / recarga`. */
  mealSpent: string | null;
};

export type InvoiceView = {
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  total: string;
};

/**
 * Fatura passada — só o resumo (mês/total), sem os itens (docs/22, "Faturas
 * Futuras"/histórico). Vem de uma `CardInvoice` armazenada (real, importada)
 * OU de um ciclo calculado (`invoiceFor`) como fallback pra cartões sem
 * fatura armazenada (ver `serialize.ts`) — `year`/`month` no lugar de
 * `periodEnd` porque `CardInvoice.periodStart`/`periodEnd` são opcionais no
 * schema (nem toda fatura importada tem o período de compra registrado).
 */
export type PastInvoiceView = {
  year: number;
  month: number;
  dueDate: string;
  total: string;
  isPaid: boolean;
};
