import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiParsedTransaction, CommandResult, TelegramOrigin } from "./types";

const parseTransactionFromImageMock = vi.fn();
const parseTransactionFromVoiceMock = vi.fn();
const parseTransactionWithAIMock = vi.fn();
const createBotTransactionMock = vi.fn();
const processDraftMock = vi.fn();
const draftFromAiMock = vi.fn();
const resolveCategoryByNameMock = vi.fn();
const resolveOriginMock = vi.fn();
const pendingGetActiveMock = vi.fn();
const answerQuestionMock = vi.fn();
const handleCreateCategoryMock = vi.fn();

vi.mock("./ai-parser", () => ({
  parseTransactionFromImage: parseTransactionFromImageMock,
  parseTransactionFromVoice: parseTransactionFromVoiceMock,
  parseTransactionWithAI: parseTransactionWithAIMock,
}));
vi.mock("./financing-parser", () => ({ parseFinancingFromDocument: vi.fn() }));
vi.mock("./create", () => ({ createBotTransaction: createBotTransactionMock }));
vi.mock("./draft", () => ({
  draftFromAi: draftFromAiMock,
  handlePendingReply: vi.fn(),
  processDraft: processDraftMock,
}));
vi.mock("./pending", () => ({
  telegramPendingRepository: { getActive: pendingGetActiveMock, upsert: vi.fn(), remove: vi.fn() },
}));
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
vi.mock("./ask", () => ({ answerQuestion: answerQuestionMock }));
vi.mock("./category", () => ({ handleCreateCategory: handleCreateCategoryMock }));

const { handleImageEntry, handleVoiceEntry, telegramHandlers } = await import("./handlers");

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

function aiText(overrides: Partial<AiParsedTransaction> = {}): AiParsedTransaction {
  return {
    isTransaction: false,
    type: "EXPENSE",
    amount: null,
    description: "",
    date: null,
    categoryName: null,
    paymentMethod: null,
    originKind: null,
    originName: null,
    ...overrides,
  };
}

describe("executeCommand — handleFreeformEntry (responder inteligente + criar categoria)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("!ai.isTransaction (intent unknown) — desvia pro responder inteligente em vez de buildUnknownReply", async () => {
    pendingGetActiveMock.mockResolvedValueOnce(null);
    parseTransactionWithAIMock.mockResolvedValueOnce(aiText({ intent: "unknown" }));
    answerQuestionMock.mockResolvedValueOnce("Resposta da IA.");

    const result = await telegramHandlers.executeCommand("user-1", { kind: "unknown" }, "oi tudo bem?");

    expect(answerQuestionMock).toHaveBeenCalledWith("user-1", "oi tudo bem?");
    expect(result.resultCode).toBe("ask_answered");
    expect(result.text).toBe("Resposta da IA.");
  });

  it("intent=create_category com createCategory preenchido — delega pra handleCreateCategory", async () => {
    pendingGetActiveMock.mockResolvedValueOnce(null);
    parseTransactionWithAIMock.mockResolvedValueOnce(
      aiText({ intent: "create_category", createCategory: { categoryName: "Academia", parentName: null } }),
    );
    handleCreateCategoryMock.mockResolvedValueOnce({
      text: "✅ Categoria criada.",
      resultCode: "create_category_created",
    } satisfies CommandResult);

    const result = await telegramHandlers.executeCommand("user-1", { kind: "unknown" }, "cria categoria academia");

    expect(handleCreateCategoryMock).toHaveBeenCalledWith("user-1", { categoryName: "Academia", parentName: null });
    expect(result.resultCode).toBe("create_category_created");
  });

  it("intent=create_category sem ai.createCategory (inconsistente) — buildUnknownReply", async () => {
    pendingGetActiveMock.mockResolvedValueOnce(null);
    parseTransactionWithAIMock.mockResolvedValueOnce(aiText({ intent: "create_category", createCategory: null }));

    const result = await telegramHandlers.executeCommand("user-1", { kind: "unknown" }, "cria categoria");

    expect(result.resultCode).toBe("unknown_message");
    expect(handleCreateCategoryMock).not.toHaveBeenCalled();
  });
});

describe("handleVoiceEntry (responder inteligente + criar categoria)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("!ai.isTransaction (intent unknown) — desvia pro responder inteligente em vez de buildUnknownReply", async () => {
    pendingGetActiveMock.mockResolvedValueOnce(null);
    parseTransactionFromVoiceMock.mockResolvedValueOnce(aiText({ intent: "unknown", description: "oi tudo bem?" }));
    answerQuestionMock.mockResolvedValueOnce("Resposta da IA.");

    const result = await handleVoiceEntry("user-1", Buffer.from("audio"), "audio/ogg");

    expect(answerQuestionMock).toHaveBeenCalledWith("user-1", "oi tudo bem?");
    expect(result.resultCode).toBe("ask_answered");
  });

  it("intent=create_category com createCategory preenchido — delega pra handleCreateCategory", async () => {
    pendingGetActiveMock.mockResolvedValueOnce(null);
    parseTransactionFromVoiceMock.mockResolvedValueOnce(
      aiText({ intent: "create_category", createCategory: { categoryName: "Pedágio", parentName: "Transporte" } }),
    );
    handleCreateCategoryMock.mockResolvedValueOnce({
      text: "✅ Categoria criada dentro de Transporte.",
      resultCode: "create_category_created",
    } satisfies CommandResult);

    const result = await handleVoiceEntry("user-1", Buffer.from("audio"), "audio/ogg");

    expect(handleCreateCategoryMock).toHaveBeenCalledWith("user-1", {
      categoryName: "Pedágio",
      parentName: "Transporte",
    });
    expect(result.resultCode).toBe("create_category_created");
  });

  it("intent=create_category sem ai.createCategory (inconsistente) — buildUnknownReply", async () => {
    pendingGetActiveMock.mockResolvedValueOnce(null);
    parseTransactionFromVoiceMock.mockResolvedValueOnce(aiText({ intent: "create_category", createCategory: null }));

    const result = await handleVoiceEntry("user-1", Buffer.from("audio"), "audio/ogg");

    expect(result.resultCode).toBe("unknown_message");
    expect(handleCreateCategoryMock).not.toHaveBeenCalled();
  });
});
