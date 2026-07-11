import { afterEach, describe, expect, it, vi } from "vitest";

const parseCardInvoiceMock = vi.fn().mockResolvedValue({ transactions: [], errors: [] });
const parsePdfStatementMock = vi.fn().mockResolvedValue({ transactions: [], errors: [] });
const parseOfxMock = vi.fn().mockResolvedValue({ transactions: [], errors: [] });

vi.mock("./card-invoice-parser", () => ({ parseCardInvoice: parseCardInvoiceMock }));
vi.mock("./pdf-parser", () => ({ parsePdfStatement: parsePdfStatementMock }));
vi.mock("./ofx-parser", () => ({ parseOfx: parseOfxMock }));
vi.mock("./csv-parser", () => ({ parseCsv: vi.fn() }));
vi.mock("./xlsx-parser", () => ({ parseXlsx: vi.fn() }));

const { parseImportFile } = await import("./index");

// clearAllMocks reseta o histórico de chamadas entre testes (mantém os
// mockResolvedValue) — sem isso o histórico acumula e assertions de
// `not.toHaveBeenCalled` de um teste enxergam chamadas do teste anterior.
afterEach(() => vi.clearAllMocks());

describe("parseImportFile — roteamento", () => {
  it("PDF + kind='card' vai pro card-invoice-parser com bytes decodificados de base64 + senha", async () => {
    const base64 = Buffer.from("conteudo-fake").toString("base64");
    await parseImportFile("fatura.pdf", base64, { kind: "card", password: "1234" });

    expect(parseCardInvoiceMock).toHaveBeenCalledWith(Buffer.from(base64, "base64"), "1234");
    expect(parsePdfStatementMock).not.toHaveBeenCalled();
  });

  it("PDF sem kind (ou kind='account') vai pro pdf-parser existente (Gemini) — comportamento de extrato INALTERADO", async () => {
    const base64 = Buffer.from("conteudo-fake").toString("base64");
    await parseImportFile("extrato.pdf", base64);

    expect(parsePdfStatementMock).toHaveBeenCalledWith(base64);
    expect(parseCardInvoiceMock).not.toHaveBeenCalled();
  });

  it("OFX continua indo pro parseOfx de sempre, independente de kind", async () => {
    await parseImportFile("extrato.ofx", "conteudo ofx", { kind: "card" });
    expect(parseOfxMock).toHaveBeenCalledWith("conteudo ofx");
  });
});
