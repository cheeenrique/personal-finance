/**
 * Tipos "view" do módulo Parcelamentos — versões serializáveis (Decimal →
 * string, Date → ISO string) de `modules/transactions/types.ts`. Necessário
 * porque `Prisma.Decimal`/`Date` de classe não atravessam a fronteira Server
 * → Client Component sem essa conversão (mesmo padrão de
 * `components/cards/types.ts`).
 */

export type InstallmentLineItemView = {
  installmentNumber: number;
  amount: string;
  date: string;
  isPaid: boolean;
};

export type InstallmentPurchaseView = {
  id: string;
  description: string;
  cardName: string;
  totalAmount: string;
  installmentsCount: number;
  paidCount: number;
  paidAmount: string;
  remainingAmount: string;
  installments: InstallmentLineItemView[];
};
