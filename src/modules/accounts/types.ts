import type { Account, Prisma } from "@/generated/prisma/client";

export type { Account };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/** Account + saldo derivado (ver service.ts `getBalance`/`listWithBalances`). */
export type AccountWithBalance = Account & {
  balance: Money;
};

export type ActionError = {
  code: string;
  message: string;
};

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/**
 * Resultado de uma transferência: as 2 pernas (EXPENSE origem / INCOME
 * destino) já persistidas, compartilhando `transferId` — ver transfer.ts
 * para a decisão de modelagem completa.
 */
export type TransferResult = {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
  date: Date;
  fromTransactionId: string;
  toTransactionId: string;
};
