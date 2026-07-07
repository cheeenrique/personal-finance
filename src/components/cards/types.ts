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
};

export type InvoiceView = {
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  total: string;
};

/** Fatura de um ciclo passado — só o resumo (mês/total), sem os itens (docs/22, "Faturas Futuras"/histórico). */
export type PastInvoiceView = {
  periodEnd: string;
  dueDate: string;
  total: string;
};
