import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import type { TransactionWithTags } from "./types";

const {
  findByIdMock,
  createMock,
  updateMock,
  accountExistsMock,
  cardExistsMock,
  findCategoryForUserMock,
  countExistingTagsMock,
} = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  accountExistsMock: vi.fn(),
  cardExistsMock: vi.fn(),
  findCategoryForUserMock: vi.fn(),
  countExistingTagsMock: vi.fn(),
}));

// `service.ts` importa `transactionRepository`/`transactionOwnership` (I/O real
// via Prisma) — mockados por inteiro pra testar só a lógica de invariantes,
// sem tocar banco (mesmo padrão de `cards/service.test.ts`).
vi.mock("./repository", () => ({
  transactionRepository: {
    findById: findByIdMock,
    create: createMock,
    update: updateMock,
  },
}));

vi.mock("./ownership", () => ({
  transactionOwnership: {
    accountExists: accountExistsMock,
    cardExists: cardExistsMock,
    findCategoryForUser: findCategoryForUserMock,
    countExistingTags: countExistingTagsMock,
  },
}));

const { transactionService } = await import("./service");
const { InvalidSourceError } = await import("./errors");

const USER_ID = "user-1";

function baseTransaction(overrides: Partial<TransactionWithTags> = {}): TransactionWithTags {
  return {
    id: "tx-1",
    userId: USER_ID,
    description: "Pagamento fatura Nubank",
    type: TransactionType.CARD_PAYMENT,
    amount: new Prisma.Decimal(100),
    categoryId: null,
    accountId: "account-1",
    cardId: "card-1",
    date: new Date("2026-07-01T12:00:00.000Z"),
    notes: null,
    isPaid: true,
    paidAt: null,
    transferId: null,
    fitId: null,
    installmentPurchaseId: null,
    installmentNumber: null,
    loanId: null,
    assetId: null,
    yieldPercentOfBenchmark: null,
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-01T12:00:00.000Z"),
    deletedAt: null,
    transactionTags: [],
    loan: null,
    ...overrides,
  } as TransactionWithTags;
}

beforeEach(() => {
  vi.clearAllMocks();
  accountExistsMock.mockResolvedValue(true);
  cardExistsMock.mockResolvedValue(true);
  findCategoryForUserMock.mockResolvedValue({ id: "category-1", type: "EXPENSE" });
  countExistingTagsMock.mockResolvedValue(0);
});

describe("createTransaction — assertSourceAndCategoryInvariant (CARD_PAYMENT)", () => {
  it("CARD_PAYMENT com accountId+cardId válidos: cria com sucesso, valida ownership dos dois", async () => {
    createMock.mockResolvedValue(baseTransaction());

    await transactionService.createTransaction(USER_ID, {
      description: "Pagamento fatura Nubank",
      amount: "100.00",
      type: TransactionType.CARD_PAYMENT,
      accountId: "account-1",
      cardId: "card-1",
      date: new Date(),
      isPaid: true,
      tagIds: [],
    });

    expect(accountExistsMock).toHaveBeenCalledWith(USER_ID, "account-1");
    expect(cardExistsMock).toHaveBeenCalledWith(USER_ID, "card-1");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("CARD_PAYMENT com só accountId (bypass do schema): lança InvalidSourceError", async () => {
    await expect(
      transactionService.createTransaction(USER_ID, {
        description: "Pagamento fatura Nubank",
        amount: "100.00",
        type: TransactionType.CARD_PAYMENT,
        accountId: "account-1",
        date: new Date(),
        isPaid: true,
        tagIds: [],
      }),
    ).rejects.toThrow(InvalidSourceError);

    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("updateTransaction — assertSourceAndCategoryInvariant contra estado mesclado", () => {
  it("CARD_PAYMENT existente, update que só muda amount/date: mantém accountId+cardId mesclados, não lança", async () => {
    findByIdMock.mockResolvedValue(baseTransaction());
    updateMock.mockResolvedValue(baseTransaction({ amount: new Prisma.Decimal(200) }));

    await expect(
      transactionService.updateTransaction(USER_ID, "tx-1", {
        amount: "200.00",
        date: new Date("2026-07-05T12:00:00.000Z"),
      }),
    ).resolves.toBeDefined();

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("CARD_PAYMENT existente, setar cardId: null explicitamente (sem tocar accountId): lança InvalidSourceError", async () => {
    findByIdMock.mockResolvedValue(baseTransaction());

    await expect(
      transactionService.updateTransaction(USER_ID, "tx-1", {
        cardId: null,
      }),
    ).rejects.toThrow(InvalidSourceError);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("mudar type de EXPENSE para CARD_PAYMENT sem enviar o par completo: lança InvalidSourceError", async () => {
    findByIdMock.mockResolvedValue(
      baseTransaction({
        type: TransactionType.EXPENSE,
        accountId: "account-1",
        cardId: null,
        categoryId: "category-1",
      }),
    );

    await expect(
      transactionService.updateTransaction(USER_ID, "tx-1", {
        type: TransactionType.CARD_PAYMENT,
      }),
    ).rejects.toThrow(InvalidSourceError);

    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("assertSourceAndCategoryInvariant — XOR preservado para INCOME/EXPENSE", () => {
  it("EXPENSE existente com accountId, update que tenta setar cardId também: lança InvalidSourceError", async () => {
    findByIdMock.mockResolvedValue(
      baseTransaction({
        type: TransactionType.EXPENSE,
        accountId: "account-1",
        cardId: null,
        categoryId: "category-1",
      }),
    );

    await expect(
      transactionService.updateTransaction(USER_ID, "tx-1", {
        cardId: "card-1",
      }),
    ).rejects.toThrow(InvalidSourceError);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("EXPENSE novo com accountId + categoryId, sem cardId: cria com sucesso (XOR ok)", async () => {
    createMock.mockResolvedValue(baseTransaction({ type: TransactionType.EXPENSE, cardId: null }));

    await expect(
      transactionService.createTransaction(USER_ID, {
        description: "Mercado",
        amount: "50.00",
        type: TransactionType.EXPENSE,
        accountId: "account-1",
        categoryId: "category-1",
        date: new Date(),
        isPaid: true,
        tagIds: [],
      }),
    ).resolves.toBeDefined();

    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
