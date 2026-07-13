import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiParserContext } from "./ai-parser";

const extractStructuredMock = vi.fn();
const callGeminiMock = vi.fn();

vi.mock("@/lib/ai/extract", () => ({ extractStructured: extractStructuredMock }));
vi.mock("@/lib/ai/gemini", () => ({ callGemini: callGeminiMock }));

const { parseTransactionFromImage, parseTransactionWithAI } = await import("./ai-parser");

const baseCtx: AiParserContext = {
  todaySaoPaulo: "2026-07-11",
  categoryNames: ["Mercado", "Delivery"],
  accountNames: ["Nubank"],
  cardNames: ["Crédito pessoal"],
  investmentNames: [],
  knownMerchants: [],
};

describe("parseTransactionFromImage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("usa role document-vision com timeout de 30s", async () => {
    extractStructuredMock.mockResolvedValueOnce([]);

    await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(extractStructuredMock).toHaveBeenCalledWith(
      "document-vision",
      { kind: "vision", bytes: expect.any(Buffer), mimeType: "image/jpeg" },
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
      { timeoutMs: 30000 },
    );
  });

  it("imagem com 1 notificação — retorna array com 1 item", async () => {
    extractStructuredMock.mockImplementationOnce(async (_role, _input, _prompt, _schema, parse) =>
      parse({
        transactions: [
          { type: "EXPENSE", amount: "67.89", description: "FILIAL ELDORA", date: null, categoryName: "Mercado", paymentMethod: "credit", originKind: null, originName: null },
        ],
      }),
    );

    const result = await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(result).toEqual([
      {
        isTransaction: true,
        type: "EXPENSE",
        amount: "67.89",
        description: "FILIAL ELDORA",
        date: null,
        categoryName: "Mercado",
        paymentMethod: "credit",
        originKind: null,
        originName: null,
      },
    ]);
  });

  it("imagem com VÁRIAS notificações empilhadas — retorna N itens", async () => {
    extractStructuredMock.mockImplementationOnce(async (_role, _input, _prompt, _schema, parse) =>
      parse({
        transactions: [
          { type: "EXPENSE", amount: "30.00", description: "99 Food", date: null, categoryName: null, paymentMethod: null, originKind: null, originName: null },
          { type: "EXPENSE", amount: "15.50", description: "Uber", date: null, categoryName: null, paymentMethod: null, originKind: null, originName: null },
          { type: "INCOME", amount: "500.00", description: "Pix recebido", date: null, categoryName: null, paymentMethod: null, originKind: null, originName: null },
        ],
      }),
    );

    const result = await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.amount)).toEqual(["30.00", "15.50", "500.00"]);
  });

  it("normaliza amount com vírgula decimal (VLM) pra ponto antes de validar", async () => {
    extractStructuredMock.mockImplementationOnce(async (_role, _input, _prompt, _schema, parse) =>
      parse({
        transactions: [
          { type: "EXPENSE", amount: "54,23", description: "Mercado X", date: null, categoryName: null, paymentMethod: null, originKind: null, originName: null },
          { type: "EXPENSE", amount: "1.234,56", description: "Loja Y", date: null, categoryName: null, paymentMethod: null, originKind: null, originName: null },
        ],
      }),
    );

    const result = await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(result[0].amount).toBe("54.23");
    expect(result[1].amount).toBe("1234.56");
  });

  it("item malformado individual é descartado — não derruba os demais itens válidos", async () => {
    extractStructuredMock.mockImplementationOnce(async (_role, _input, _prompt, _schema, parse) =>
      parse({
        transactions: [
          { type: "EXPENSE", amount: "30.00", description: "Válido", date: null, categoryName: null, paymentMethod: null, originKind: null, originName: null },
          { type: "INVALID_TYPE", amount: "10.00", description: "Malformado" },
          { description: "" }, // description vazia (min 1) e sem type
        ],
      }),
    );

    const result = await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Válido");
  });

  it("imagem sem nenhum lançamento — array vazio (nunca null)", async () => {
    extractStructuredMock.mockImplementationOnce(async (_role, _input, _prompt, _schema, parse) => parse({ transactions: [] }));

    const result = await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(result).toEqual([]);
  });

  it("extração indisponível (NVIDIA + Gemini falharam) — array vazio, nunca lança", async () => {
    extractStructuredMock.mockResolvedValueOnce(null);

    const result = await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(result).toEqual([]);
  });

  it("envelope fora do shape esperado (nem transactions[]) — array vazio", async () => {
    extractStructuredMock.mockImplementationOnce(async (_role, _input, _prompt, _schema, parse) => parse({ foo: "bar" }));

    const result = await parseTransactionFromImage(Buffer.from("bytes"), "image/jpeg", null, baseCtx);

    expect(result).toEqual([]);
  });
});

describe("parseTransactionWithAI — create_category", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("intent=create_category com pai citado — mapeia categoryName e parentName", async () => {
    callGeminiMock.mockImplementationOnce(async (_contents, _source, _schema, parse) =>
      parse({
        isTransaction: false,
        type: "EXPENSE",
        description: "criar categoria",
        intent: "create_category",
        createCategory: { categoryName: "Pedágio", parentName: "Transporte" },
      }),
    );

    const result = await parseTransactionWithAI("cria categoria pedágio dentro de transporte", baseCtx);

    expect(result?.intent).toBe("create_category");
    expect(result?.createCategory).toEqual({ categoryName: "Pedágio", parentName: "Transporte" });
  });

  it("intent=create_category sem pai — parentName null", async () => {
    callGeminiMock.mockImplementationOnce(async (_contents, _source, _schema, parse) =>
      parse({
        isTransaction: false,
        type: "EXPENSE",
        description: "criar categoria",
        intent: "create_category",
        createCategory: { categoryName: "Academia", parentName: null },
      }),
    );

    const result = await parseTransactionWithAI("cria categoria academia", baseCtx);

    expect(result?.createCategory).toEqual({ categoryName: "Academia", parentName: null });
  });

  it("intent diferente de create_category — createCategory vem null", async () => {
    callGeminiMock.mockImplementationOnce(async (_contents, _source, _schema, parse) =>
      parse({
        isTransaction: true,
        type: "EXPENSE",
        description: "mercado",
        intent: "register",
      }),
    );

    const result = await parseTransactionWithAI("mercado 120", baseCtx);

    expect(result?.createCategory).toBeNull();
  });
});
