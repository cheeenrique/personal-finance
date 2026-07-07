import type { AccountType } from "@/generated/prisma/enums";

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
