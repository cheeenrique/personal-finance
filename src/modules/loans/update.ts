import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import type { Loan } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import type { InterestPeriod } from "@/generated/prisma/enums";
import { assertAccountOwnership, assertCategoryOwnership, deriveLoanProgress } from "./service";
import { loanRepository } from "./repository";
import { regenerateUnpaidInstallments } from "./installments";
import { LoanNotFoundError, LoanInterestInvariantError, LoanTotalBelowPrincipalError } from "./errors";
import type { UpdateLoanInput } from "./schemas";
import type { LoanWithProgress } from "./types";

/** Campos editáveis do `Loan` (docs da tarefa, "Editar") já MESCLADOS (existente + patch) — insumo de `updateLoan`. */
type MergedLoanFields = {
  description: string;
  lender: string | null;
  principal: Prisma.Decimal;
  totalToPay: Prisma.Decimal;
  installmentsCount: number;
  installmentAmount: Prisma.Decimal;
  firstDueDate: Date;
  accountId: string;
  categoryId: string | null;
  interestRate: Prisma.Decimal | null;
  interestPeriod: InterestPeriod | null;
};

/**
 * `totalToPay` = pagas (valor REAL já pago) + parcelas futuras × novo
 * `installmentAmount` — usado só quando o patch muda `installmentAmount`
 * SEM informar `totalToPay` junto (ex.: botão "Atualizar valor da parcela"
 * do financiamento, `update-installment-amount-dialog.tsx`, que manda só
 * `{ installmentAmount }`). Os 2 modais de edição completa
 * (`LoanFormModal`/`FinancingFormModal`) sempre mandam os dois campos
 * juntos (`totalToPay` calculado/editado no form), então nunca caem aqui —
 * sem isso, `regenerateUnpaidInstallments` rodaria o rateio sobre o
 * `totalToPay` ANTIGO (incompatível com o `installmentAmount` novo) e a
 * ÚLTIMA parcela sairia com um resíduo estranho em vez do valor novo exato
 * (ver `installments.ts` `splitLoanInstallmentAmounts`).
 */
function recomputeTotalToPayForInstallmentAmount(
  paid: { amount: Prisma.Decimal }[],
  installmentsCount: number,
  installmentAmount: Prisma.Decimal,
): Prisma.Decimal {
  const paidTotal = paid.reduce((sum, installment) => sum.plus(installment.amount), new Prisma.Decimal(0));
  const remainingCount = Math.max(installmentsCount - paid.length, 0);
  return paidTotal.plus(installmentAmount.times(remainingCount));
}

/**
 * Mescla `existing` (estado atual do `Loan`) com `input` (patch parcial) —
 * mesmo padrão de `transactions/service.ts` `updateTransaction` (`input.x
 * !== undefined ? input.x : existing.x`, nunca `input.x ?? existing.x` pra
 * campo nullable, senão um `null` explícito no patch cairia pro valor
 * antigo em vez de limpar o campo).
 *
 * `paid` (parcelas EXPENSE já pagas) só alimenta o recálculo automático de
 * `totalToPay` acima — ver `recomputeTotalToPayForInstallmentAmount`.
 */
function mergeLoanFields(existing: Loan, input: UpdateLoanInput, paid: { amount: Prisma.Decimal }[]): MergedLoanFields {
  const installmentsCount = input.installmentsCount ?? existing.installmentsCount;
  const installmentAmount =
    input.installmentAmount !== undefined ? new Prisma.Decimal(input.installmentAmount) : existing.installmentAmount;
  const installmentAmountChanged =
    input.installmentAmount !== undefined && !installmentAmount.equals(existing.installmentAmount);

  const totalToPay =
    input.totalToPay !== undefined
      ? new Prisma.Decimal(input.totalToPay)
      : installmentAmountChanged
        ? recomputeTotalToPayForInstallmentAmount(paid, installmentsCount, installmentAmount)
        : existing.totalToPay;

  return {
    description: input.description ?? existing.description,
    lender: input.lender !== undefined ? input.lender : existing.lender,
    principal: input.principal !== undefined ? new Prisma.Decimal(input.principal) : existing.principal,
    totalToPay,
    installmentsCount,
    installmentAmount,
    firstDueDate: input.firstDueDate ?? existing.firstDueDate,
    accountId: input.accountId ?? existing.accountId,
    categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
    interestRate:
      input.interestRate !== undefined
        ? input.interestRate === null
          ? null
          : new Prisma.Decimal(input.interestRate)
        : existing.interestRate,
    interestPeriod: input.interestPeriod !== undefined ? input.interestPeriod : existing.interestPeriod,
  };
}

/** `interestRate`/`interestPeriod` só fazem sentido juntos (juros OPCIONAL, docs/03-DATABASE.md) — nunca um sem o outro. */
function assertInterestInvariant(interestRate: Prisma.Decimal | null, interestPeriod: InterestPeriod | null): void {
  if (Boolean(interestRate) !== Boolean(interestPeriod)) {
    throw new LoanInterestInvariantError({ interestRate: interestRate?.toString() ?? null, interestPeriod });
  }
}

/** Mesma invariante de `createLoanSchema` (`totalToPay >= principal`), reavaliada contra o estado MESCLADO — não dá pra expressar isso num `.refine()` de schema quando os dois campos podem vir em payloads parciais diferentes. */
function assertTotalToPayInvariant(principal: Prisma.Decimal, totalToPay: Prisma.Decimal): void {
  if (totalToPay.lessThan(principal)) {
    throw new LoanTotalBelowPrincipalError({ principal: principal.toString(), totalToPay: totalToPay.toString() });
  }
}

/**
 * Edita um empréstimo existente (docs da tarefa, "Editar"). Só regenera as
 * parcelas NÃO PAGAS (`installments.ts` `regenerateUnpaidInstallments`)
 * quando `installmentsCount`/`installmentAmount`/`firstDueDate`/`totalToPay`
 * mudam de fato (comparado contra o valor ATUAL, não só "veio no payload")
 * — editar só `description`/`lender`, por exemplo, nunca deveria apagar/
 * recriar parcela nenhuma. `totalToPay` entra no gatilho além dos 3 campos
 * citados na tarefa porque ele TAMBÉM alimenta `splitLoanInstallmentAmounts`
 * (o resíduo da última parcela depende dele) — mudar só o total sem mudar
 * count/amount/dueDate ainda quebraria a soma das parcelas se não
 * regenerar.
 *
 * Arquivo próprio (não `service.ts`, não `installments.ts`): `installments.ts`
 * já importa `assertAccountOwnership`/`assertCategoryOwnership` DE
 * `service.ts` (pra `createLoan`) — colocar `updateLoan` em `service.ts`
 * criaria um ciclo (`service.ts` → `installments.ts` → `service.ts`), e
 * colocar em `installments.ts` misturaria "criar parcelas" com "editar
 * contrato + regenerar" no mesmo arquivo (rule 05-naming-size.md, ≤300
 * linhas — o arquivo já estava no limite). `update.ts` importa de AMBOS
 * (`service.ts` pros asserts/`deriveLoanProgress`, `installments.ts` pra
 * `regenerateUnpaidInstallments`) sem nenhum dos dois depender de volta.
 * `actions.ts` chama esta função diretamente, mesmo padrão de
 * `createLoanAction` → `installments.ts` `createLoan` (não passa por
 * `loanService`).
 */
export async function updateLoan(userId: string, id: string, input: UpdateLoanInput): Promise<LoanWithProgress> {
  const existing = await loanRepository.findByIdWithTransactions(userId, id);
  if (!existing) throw new LoanNotFoundError(id);

  const paid = existing.transactions.filter(
    (transaction) => transaction.type === TransactionType.EXPENSE && transaction.isPaid,
  );

  const merged = mergeLoanFields(existing, input, paid);
  assertInterestInvariant(merged.interestRate, merged.interestPeriod);
  assertTotalToPayInvariant(merged.principal, merged.totalToPay);

  if (input.accountId) await assertAccountOwnership(userId, input.accountId);
  if (input.categoryId) await assertCategoryOwnership(userId, input.categoryId);

  const needsRegeneration =
    (input.installmentsCount !== undefined && input.installmentsCount !== existing.installmentsCount) ||
    (input.installmentAmount !== undefined &&
      !new Prisma.Decimal(input.installmentAmount).equals(existing.installmentAmount)) ||
    (input.firstDueDate !== undefined && input.firstDueDate.getTime() !== existing.firstDueDate.getTime()) ||
    (input.totalToPay !== undefined && !new Prisma.Decimal(input.totalToPay).equals(existing.totalToPay));

  return prisma.$transaction(async (tx) => {
    const updated = await loanRepository.update(
      userId,
      id,
      {
        description: merged.description,
        lender: merged.lender,
        principal: merged.principal,
        totalToPay: merged.totalToPay,
        installmentsCount: merged.installmentsCount,
        installmentAmount: merged.installmentAmount,
        firstDueDate: merged.firstDueDate,
        accountId: merged.accountId,
        categoryId: merged.categoryId,
        interestRate: merged.interestRate,
        interestPeriod: merged.interestPeriod,
      },
      tx,
    );
    if (!updated) throw new LoanNotFoundError(id);

    if (needsRegeneration) {
      await loanRepository.softDeleteUnpaidInstallments(userId, id, tx);
      await regenerateUnpaidInstallments(tx, {
        userId,
        loanId: id,
        description: merged.description,
        accountId: merged.accountId,
        categoryId: merged.categoryId,
        totalToPay: merged.totalToPay,
        installmentAmount: merged.installmentAmount,
        installmentsCount: merged.installmentsCount,
        firstDueDate: merged.firstDueDate,
        paidInstallments: paid,
      });
    }

    const fresh = await loanRepository.findByIdWithTransactions(userId, id, tx);
    if (!fresh) throw new LoanNotFoundError(id);
    return deriveLoanProgress(fresh);
  });
}
