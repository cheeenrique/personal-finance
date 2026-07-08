import { Prisma, type Account } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { calendarPartsSP, startOfDaySP } from "@/lib/date/calendar-sp";
import {
  accountRepository,
  type CreateAccountData,
  type UpdateAccountData,
  type UnpaidExpenseRow,
} from "./repository";
import { AccountNotFoundError } from "./errors";
import type { AccountWithBalance, InsufficientBalanceItem, InsufficientBalanceReport } from "./types";

/**
 * Sinal de cada tipo de Transaction no saldo da conta. INCOME soma, EXPENSE e
 * CARD_PAYMENT subtraem (docs/03-DATABASE.md: CARD_PAYMENT "reduz o saldo da
 * conta"). `TRANSFER` "puro" nunca aparece aqui — as pernas de transferência
 * já chegam como EXPENSE/INCOME (ver transfer.ts para a decisão de modelagem).
 */
function signedAmount(type: string, amount: Prisma.Decimal): Prisma.Decimal {
  switch (type) {
    case TransactionType.INCOME:
      return amount;
    case TransactionType.EXPENSE:
    case TransactionType.CARD_PAYMENT:
      return amount.negated();
    default:
      return new Prisma.Decimal(0);
  }
}

function computeBalance(
  initialBalance: Prisma.Decimal,
  sums: Array<{ type: string; sum: Prisma.Decimal }>,
): Prisma.Decimal {
  return sums.reduce((total, { type, sum }) => total.plus(signedAmount(type, sum)), initialBalance);
}

/** Saldo derivado sob demanda — `initialBalance + Σ Transactions` (docs/21-ACCOUNTS.md). */
async function getBalance(userId: string, accountId: string): Promise<Prisma.Decimal> {
  const account = await accountRepository.findById(userId, accountId);
  if (!account) throw new AccountNotFoundError(accountId);

  const sums = await accountRepository.sumAmountsByType(userId, [accountId]);
  return computeBalance(account.initialBalance, sums);
}

/** Lista contas + saldo de cada, em 1-2 queries (sem N+1). */
async function listWithBalances(userId: string): Promise<AccountWithBalance[]> {
  const accounts = await accountRepository.list(userId);
  if (accounts.length === 0) return [];

  const sums = await accountRepository.sumAmountsByType(
    userId,
    accounts.map((account) => account.id),
  );

  const sumsByAccount = new Map<string, Array<{ type: string; sum: Prisma.Decimal }>>();
  for (const row of sums) {
    const bucket = sumsByAccount.get(row.accountId) ?? [];
    bucket.push({ type: row.type, sum: row.sum });
    sumsByAccount.set(row.accountId, bucket);
  }

  return accounts.map((account) => ({
    ...account,
    balance: computeBalance(account.initialBalance, sumsByAccount.get(account.id) ?? []),
  }));
}

/** Soma dos saldos de TODAS as contas ativas, incluindo OTHER (docs/21-ACCOUNTS.md). */
async function totalBalance(userId: string): Promise<Prisma.Decimal> {
  const accounts = await listWithBalances(userId);
  return accounts.reduce((total, account) => total.plus(account.balance), new Prisma.Decimal(0));
}

async function createAccount(userId: string, input: CreateAccountData): Promise<Account> {
  return accountRepository.create(userId, input);
}

async function updateAccount(userId: string, id: string, input: UpdateAccountData): Promise<Account> {
  const updated = await accountRepository.update(userId, id, input);
  if (!updated) throw new AccountNotFoundError(id);
  return updated;
}

/**
 * Soft delete (docs/21-ACCOUNTS.md: "preferência soft delete"). Não bloqueia
 * por transações existentes — elas continuam referenciando a conta
 * normalmente (soft delete não quebra FK, diferente de exclusão física).
 */
async function deleteAccount(userId: string, id: string): Promise<void> {
  const deleted = await accountRepository.softDelete(userId, id);
  if (!deleted) throw new AccountNotFoundError(id);
}

/**
 * Início do PRÓXIMO mês (America/Sao_Paulo) — limite exclusivo do waterfall
 * de "Saldo insuficiente" (ver `getInsufficientBalanceReport`): inclui
 * previstas vencidas + do mês corrente, nunca de meses futuros.
 */
function startOfNextMonthSP(refDate: Date): Date {
  const { year, month } = calendarPartsSP(refDate);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return startOfDaySP(nextYear, nextMonth, 1);
}

/**
 * Waterfall de UMA conta: cobre `previstas` (já ordenadas por `date` asc, ver
 * `accountRepository.listUnpaidExpensesByAccount`) com `available`, da mais
 * antiga pra mais nova — regra confirmada pelo dono do produto. Retorna só as
 * previstas com `falta > 0`.
 */
function waterfallShortfall(
  available: Prisma.Decimal,
  previstas: UnpaidExpenseRow[],
): Array<UnpaidExpenseRow & { falta: Prisma.Decimal }> {
  let restante = available;
  const shortfalls: Array<UnpaidExpenseRow & { falta: Prisma.Decimal }> = [];

  for (const previsto of previstas) {
    const coberto = restante.lessThan(previsto.amount) ? restante : previsto.amount;
    const falta = previsto.amount.minus(coberto);
    restante = restante.minus(coberto);

    if (falta.greaterThan(0)) shortfalls.push({ ...previsto, falta });
  }

  return shortfalls;
}

/**
 * Alerta "Saldo insuficiente" (topo do Dashboard): por conta, saldo
 * disponível vs. despesas previstas (EXPENSE, `isPaid=false`, vencidas + do
 * mês corrente) — waterfall da previsão mais antiga pra mais nova.
 * Reaproveita `listWithBalances` (mesmo saldo já usado no resto do app,
 * NUNCA reimplementado aqui — `available` de cada conta já é só
 * `isPaid=true`). Retorna client-ready (`amount`/`falta`/`deficitTotal` como
 * string, ver types.ts `InsufficientBalanceReport`) porque não há outro
 * consumidor do relatório além do Dashboard.
 *
 * `refDate` default = instante REAL (`new Date()`), nunca `nowInSaoPaulo()`:
 * `startOfNextMonthSP` → `calendarPartsSP` já converte pra calendário SP —
 * um epoch deslocado converteria DUAS vezes e, na madrugada (00:00–03:00 SP)
 * do dia 1º, o corte cairia no mês ANTERIOR, perdendo as previstas do mês
 * corrente (ver JSDoc em `modules/transactions/installments.ts`
 * `cancelInstallmentPurchase`).
 */
async function getInsufficientBalanceReport(
  userId: string,
  refDate: Date = new Date(),
): Promise<InsufficientBalanceReport> {
  const accounts = await listWithBalances(userId);
  if (accounts.length === 0) return { deficitTotal: "0.00", items: [] };

  const before = startOfNextMonthSP(refDate);
  const previstas = await accountRepository.listUnpaidExpensesByAccount(
    userId,
    accounts.map((account) => account.id),
    before,
  );

  const previstasByAccount = new Map<string, UnpaidExpenseRow[]>();
  for (const previsto of previstas) {
    const bucket = previstasByAccount.get(previsto.accountId) ?? [];
    bucket.push(previsto);
    previstasByAccount.set(previsto.accountId, bucket);
  }

  let deficitTotal = new Prisma.Decimal(0);
  const items: InsufficientBalanceItem[] = [];

  for (const account of accounts) {
    const shortfalls = waterfallShortfall(account.balance, previstasByAccount.get(account.id) ?? []);

    for (const shortfall of shortfalls) {
      deficitTotal = deficitTotal.plus(shortfall.falta);
      items.push({
        id: shortfall.id,
        description: shortfall.description,
        date: shortfall.date,
        accountName: account.name,
        amount: shortfall.amount.toString(),
        falta: shortfall.falta.toString(),
      });
    }
  }

  items.sort((a, b) => a.date.getTime() - b.date.getTime());

  return { deficitTotal: deficitTotal.toString(), items };
}

export const accountService = {
  getBalance,
  listWithBalances,
  totalBalance,
  createAccount,
  updateAccount,
  deleteAccount,
  getInsufficientBalanceReport,
};
