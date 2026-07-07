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

/**
 * Item do alerta "Saldo insuficiente" (topo do Dashboard) — uma despesa
 * prevista (EXPENSE, isPaid=false) que o saldo da própria conta não cobre,
 * waterfall por data (ver service.ts `getInsufficientBalanceReport`). Já
 * client-ready (`amount`/`falta` como string) — este relatório não tem
 * nenhum outro consumidor além do Dashboard, então não há motivo pra manter
 * uma forma intermediária em `Decimal` cruzando módulos.
 */
export type InsufficientBalanceItem = {
  id: string;
  description: string;
  date: Date;
  accountName: string;
  amount: string;
  falta: string;
};

/** Relatório completo do alerta "Saldo insuficiente" — `items: []` quando o saldo de toda conta cobre suas próprias previstas. */
export type InsufficientBalanceReport = {
  deficitTotal: string;
  items: InsufficientBalanceItem[];
};
