import type { AccountType } from "@/generated/prisma/enums";
import type { TransactionType } from "@/generated/prisma/enums";

/**
 * Forma serializável de `AccountWithBalance` (@/modules/accounts/types) para
 * cruzar a fronteira Server → Client Component. `Prisma.Decimal` não é
 * serializável por RSC (não é um valor simples) — o Server Component
 * converte pra string na borda antes de passar adiante (docs/03-DATABASE.md:
 * "Parse/format só na borda").
 */
export type AccountCardData = {
  id: string;
  name: string;
  type: AccountType;
  /** Decimal(12,2) como string — nunca float. */
  balance: string;
  initialBalance: string;
  color: string | null;
  icon: string | null;
  isActive: boolean;
};

/**
 * Linha do histórico de transações da conta (detalhe), já com `amount`
 * convertido pra string na borda pelo mesmo motivo de `AccountCardData`.
 * `date` permanece `Date` — tipo nativamente serializável por RSC.
 */
export type AccountTransactionRow = {
  id: string;
  date: Date;
  description: string;
  type: TransactionType;
  amount: string;
};
