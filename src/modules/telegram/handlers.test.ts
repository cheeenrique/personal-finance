import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiParsedTransaction, CommandResult, TelegramOrigin } from "./types";

const parseTransactionFromImageMock = vi.fn();
const createBotTransactionMock = vi.fn();
const processDraftMock = vi.fn();
const draftFromAiMock = vi.fn();
const resolveCategoryByNameMock = vi.fn();
const resolveOriginMock = vi.fn();

vi.mock("./ai-parser", () => ({
  parseTransactionFromImage: parseTransactionFromImageMock,
  parseTransactionFromVoice: vi.fn(),
  parseTransactionWithAI: vi.fn(),
}));
vi.mock("./financing-parser", () => ({ parseFinancingFromDocument: vi.fn() }));
vi.mock("./create", () => ({ createBotTransaction: createBotTransactionMock }));
vi.mock("./draft", () => ({
  draftFromAi: draftFromAiMock,
  handlePendingReply: vi.fn(),
  processDraft: processDraftMock,
}));
vi.mock("./pending", () => ({ telegramPendingRepository: { getActive: vi.fn(), upsert: vi.fn(), remove: vi.fn() } }));
vi.mock("./resolve", () => ({
  listCategoryNamesForAI: vi.fn().mockResolvedValue([]),
  listInvestmentNamesForAI: vi.fn().mockResolvedValue([]),
  listKnownMerchantsForAI: vi.fn().mockResolvedValue([]),
  listOriginNamesForAI: vi.fn().mockResolvedValue({ accountNames: [], cardNames: [] }),
  resolveCategoryByName: resolveCategoryByNameMock,
  resolveCategoryId: vi.fn(),
  resolveOrigin: resolveOriginMock,
}));
vi.mock("./query", () => ({ executeTelegramQuery: vi.fn(), resolvePeriodRange: vi.fn() }));
vi.mock("./invest", () => ({ handleInvestContribution: vi.fn() }));

const { handleImageEntry } = await import("./handlers");

function aiItem(overrides: Partial<AiParsedTransaction> = {}): AiParsedTransaction {
  return {
    isTransaction: true,
    type: "EXPENSE",
    amount: "30.00",
    description: "99 Food",
    date: null,
    categoryName: null,
    paymentMethod: null,
    originKind: null,
    originName: null,
    ...overrides,
  };
}

const defaultOrigin: TelegramOrigin = { kind: "account", id: "acc-1", label: "Conta Nubank" };
const defaultCategory = { id: "cat-1", name: "Outros" };

describe("handleImageEntry", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("array vazio (nenhum lançamento legível) — pede reenvio, nunca cria nada", async () => {
    parseTransactionFromImageMock.mockResolvedValueOnce([]);

    const result = await handleImageEntry("user-1", Buffer.from("x"), "image/jpeg", null);

    expect(result.resultCode).toBe("image_unreadable");
    expect(createBotTransactionMock).not.toHaveBeenCalled();
    expect(processDraftMock).not.toHaveBeenCalled();
  });

  it("nenhum item com amount legível — mesma resposta de array vazio", async () => {
    parseTransactionFromImageMock.mockResolvedValueOnce([aiItem({ amount: null })]);

    const result = await handleImageEntry("user-1", Buffer.from("x"), "image/jpeg", null);

    expect(result.resultCode).toBe("image_unreadable");
    expect(processDraftMock).not.toHaveBeenCalled();
  });

  it("1 lançamento — cai no fluxo conversacional de sempre (processDraft), sem criar direto", async () => {
    const item = aiItem();
    parseTransactionFromImageMock.mockResolvedValueOnce([item]);
    draftFromAiMock.mockReturnValueOnce({ type: "EXPENSE", amount: "30.00" });
    processDraftMock.mockResolvedValueOnce({ text: "ok", resultCode: "transaction_created" } satisfies CommandResult);

    const result = await handleImageEntry("user-1", Buffer.from("x"), "image/jpeg", null);

    expect(processDraftMock).toHaveBeenCalledTimes(1);
    expect(createBotTransactionMock).not.toHaveBeenCalled();
    expect(result.resultCode).toBe("transaction_created");
  });

  it("N lançamentos (>1) — cria TODOS direto, sem processDraft, com resposta combinada", async () => {
    parseTransactionFromImageMock.mockResolvedValueOnce([
      aiItem({ description: "99 Food", amount: "30.00" }),
      aiItem({ description: "Uber", amount: "15.50", type: "EXPENSE" }),
    ]);
    resolveCategoryByNameMock.mockResolvedValue(defaultCategory);
    resolveOriginMock.mockResolvedValue(defaultOrigin);
    createBotTransactionMock
      .mockResolvedValueOnce({
        success: true,
        created: { id: "t1", description: "99 Food", amount: { toString: () => "30.00" }, date: new Date(), isPaid: true },
      })
      .mockResolvedValueOnce({
        success: true,
        created: { id: "t2", description: "Uber", amount: { toString: () => "15.50" }, date: new Date(), isPaid: true },
      });

    const result = await handleImageEntry("user-1", Buffer.from("x"), "image/jpeg", null);

    expect(processDraftMock).not.toHaveBeenCalled();
    expect(createBotTransactionMock).toHaveBeenCalledTimes(2);
    expect(result.resultCode).toBe("image_multi_created");
    expect(result.text).toContain("2 lançamentos cadastrados");
    expect(result.text).toContain("99 Food");
    expect(result.text).toContain("Uber");
    expect(result.text).toContain("45,50");
  });

  it("N lançamentos com 1 falha de criação isolada — descarta só o item que falhou", async () => {
    parseTransactionFromImageMock.mockResolvedValueOnce([
      aiItem({ description: "Válido", amount: "30.00" }),
      aiItem({ description: "Inválido", amount: "15.50" }),
    ]);
    resolveCategoryByNameMock.mockResolvedValue(defaultCategory);
    resolveOriginMock.mockResolvedValue(defaultOrigin);
    createBotTransactionMock
      .mockResolvedValueOnce({
        success: true,
        created: { id: "t1", description: "Válido", amount: { toString: () => "30.00" }, date: new Date(), isPaid: true },
      })
      .mockResolvedValueOnce({ success: false, message: "Dados inválidos." });

    const result = await handleImageEntry("user-1", Buffer.from("x"), "image/jpeg", null);

    expect(result.resultCode).toBe("image_multi_created");
    expect(result.text).toContain("1 lançamentos cadastrados");
    expect(result.text).toContain("Válido");
    expect(result.text).not.toContain("Inválido");
  });

  it("N lançamentos onde TODAS as criações falham — erro genérico, não confirmação vazia", async () => {
    parseTransactionFromImageMock.mockResolvedValueOnce([
      aiItem({ description: "A", amount: "30.00" }),
      aiItem({ description: "B", amount: "15.50" }),
    ]);
    resolveCategoryByNameMock.mockResolvedValue(defaultCategory);
    resolveOriginMock.mockResolvedValue(defaultOrigin);
    createBotTransactionMock.mockResolvedValue({ success: false, message: "Dados inválidos." });

    const result = await handleImageEntry("user-1", Buffer.from("x"), "image/jpeg", null);

    expect(result.resultCode).toBe("image_multi_all_failed");
  });
});
