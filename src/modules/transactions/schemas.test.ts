import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { TransactionType } from "@/generated/prisma/enums";
import { createTransactionSchema, updateTransactionSchema } from "./schemas";

/**
 * `createTransactionSchema`/`updateTransactionSchema` — invariante de origem
 * (conta/cartão) é type-aware desde a correção do bug de `CARD_PAYMENT`
 * perdendo `cardId` na edição (docs/superpowers/specs/2026-07-13-card-payment-forcar-cardid-design.md):
 * CARD_PAYMENT exige AMBOS accountId+cardId, INCOME/EXPENSE mantém o XOR.
 */

const BASE_CREATE_INPUT = {
  description: "Pagamento fatura Nubank",
  amount: "100.00",
};

function findIssuePath(result: z.ZodSafeParseResult<unknown>, path: string): boolean {
  if (result.success) return false;
  return result.error.issues.some((issue) => issue.path.includes(path));
}

describe("createTransactionSchema", () => {
  it("CARD_PAYMENT com accountId + cardId, sem categoryId: válido", () => {
    const result = createTransactionSchema.safeParse({
      ...BASE_CREATE_INPUT,
      type: TransactionType.CARD_PAYMENT,
      accountId: "account-1",
      cardId: "card-1",
    });
    expect(result.success).toBe(true);
  });

  it("CARD_PAYMENT só com accountId (sem cardId): inválido, issue em cardId", () => {
    const result = createTransactionSchema.safeParse({
      ...BASE_CREATE_INPUT,
      type: TransactionType.CARD_PAYMENT,
      accountId: "account-1",
    });
    expect(result.success).toBe(false);
    expect(findIssuePath(result, "cardId")).toBe(true);
  });

  it("CARD_PAYMENT só com cardId (sem accountId): inválido, issue em accountId", () => {
    const result = createTransactionSchema.safeParse({
      ...BASE_CREATE_INPUT,
      type: TransactionType.CARD_PAYMENT,
      cardId: "card-1",
    });
    expect(result.success).toBe(false);
    expect(findIssuePath(result, "accountId")).toBe(true);
  });

  it("CARD_PAYMENT com categoryId preenchido: inválido (regra existente, não regredir)", () => {
    const result = createTransactionSchema.safeParse({
      ...BASE_CREATE_INPUT,
      type: TransactionType.CARD_PAYMENT,
      accountId: "account-1",
      cardId: "card-1",
      categoryId: "category-1",
    });
    expect(result.success).toBe(false);
    expect(findIssuePath(result, "categoryId")).toBe(true);
  });

  it("EXPENSE/INCOME com só accountId: válido (XOR preservado)", () => {
    for (const type of [TransactionType.EXPENSE, TransactionType.INCOME]) {
      const result = createTransactionSchema.safeParse({
        ...BASE_CREATE_INPUT,
        type,
        accountId: "account-1",
        categoryId: "category-1",
      });
      expect(result.success).toBe(true);
    }
  });

  it("EXPENSE/INCOME com só cardId: válido (XOR preservado)", () => {
    for (const type of [TransactionType.EXPENSE, TransactionType.INCOME]) {
      const result = createTransactionSchema.safeParse({
        ...BASE_CREATE_INPUT,
        type,
        cardId: "card-1",
        categoryId: "category-1",
      });
      expect(result.success).toBe(true);
    }
  });

  it("EXPENSE/INCOME com accountId + cardId: inválido (XOR preservado)", () => {
    for (const type of [TransactionType.EXPENSE, TransactionType.INCOME]) {
      const result = createTransactionSchema.safeParse({
        ...BASE_CREATE_INPUT,
        type,
        accountId: "account-1",
        cardId: "card-1",
        categoryId: "category-1",
      });
      expect(result.success).toBe(false);
      expect(findIssuePath(result, "accountId")).toBe(true);
    }
  });

  it("EXPENSE/INCOME sem accountId nem cardId: inválido (XOR preservado)", () => {
    for (const type of [TransactionType.EXPENSE, TransactionType.INCOME]) {
      const result = createTransactionSchema.safeParse({
        ...BASE_CREATE_INPUT,
        type,
        categoryId: "category-1",
      });
      expect(result.success).toBe(false);
      expect(findIssuePath(result, "accountId")).toBe(true);
    }
  });
});

describe("updateTransactionSchema", () => {
  it("{ type: CARD_PAYMENT, accountId, cardId } no mesmo payload: válido (não bloqueia mais)", () => {
    const result = updateTransactionSchema.safeParse({
      type: TransactionType.CARD_PAYMENT,
      accountId: "account-1",
      cardId: "card-1",
    });
    expect(result.success).toBe(true);
  });

  it("{ type: EXPENSE, accountId, cardId } no mesmo payload: inválido (XOR ainda vale)", () => {
    const result = updateTransactionSchema.safeParse({
      type: TransactionType.EXPENSE,
      accountId: "account-1",
      cardId: "card-1",
    });
    expect(result.success).toBe(false);
    expect(findIssuePath(result, "accountId")).toBe(true);
  });

  it("payload sem type, com accountId + cardId: ainda bloqueado pelo refine (comportamento atual preservado)", () => {
    const result = updateTransactionSchema.safeParse({
      accountId: "account-1",
      cardId: "card-1",
    });
    expect(result.success).toBe(false);
    expect(findIssuePath(result, "accountId")).toBe(true);
  });
});
