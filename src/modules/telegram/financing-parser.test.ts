import { afterEach, describe, expect, it, vi } from "vitest";

const extractPdfTextMock = vi.fn();
const extractStructuredMock = vi.fn();

class FakePdfPasswordError extends Error {}

vi.mock("@/lib/pdf/extract-text", () => ({
  extractPdfText: extractPdfTextMock,
  PdfPasswordError: FakePdfPasswordError,
}));
vi.mock("@/lib/ai/extract", () => ({ extractStructured: extractStructuredMock }));

const { parseFinancingFromDocument } = await import("./financing-parser");

describe("parseFinancingFromDocument", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("PDF com text layer usa role document-text (deepseek, thinking off — MESMO role da fatura, sem reasoning por padrão)", async () => {
    extractPdfTextMock.mockResolvedValueOnce({ text: "texto do contrato", hasTextLayer: true });
    extractStructuredMock.mockResolvedValueOnce({ principal: "1000.00" });

    const result = await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf");

    expect(result).toEqual({ principal: "1000.00" });
    expect(extractStructuredMock).toHaveBeenCalledWith(
      "document-text",
      { kind: "text", text: "texto do contrato" },
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("PDF SEM text layer (escaneado) usa role document-vision", async () => {
    extractPdfTextMock.mockResolvedValueOnce({ text: "", hasTextLayer: false });
    extractStructuredMock.mockResolvedValueOnce(null);

    await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf");

    expect(extractStructuredMock).toHaveBeenCalledWith(
      "document-vision",
      { kind: "vision", bytes: expect.any(Buffer), mimeType: "application/pdf" },
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("foto (não-PDF) usa role document-vision direto, sem tentar extractPdfText", async () => {
    extractStructuredMock.mockResolvedValueOnce({ lender: "Banco X" });

    const result = await parseFinancingFromDocument(Buffer.from("bytes"), "image/jpeg");

    expect(result).toEqual({ lender: "Banco X" });
    expect(extractPdfTextMock).not.toHaveBeenCalled();
    expect(extractStructuredMock).toHaveBeenCalledWith(
      "document-vision",
      { kind: "vision", bytes: expect.any(Buffer), mimeType: "image/jpeg" },
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("senha errada/faltando (PdfPasswordError) retorna null, nunca lança", async () => {
    extractPdfTextMock.mockRejectedValueOnce(new FakePdfPasswordError("senha errada"));

    const result = await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf", "senha-errada");

    expect(result).toBeNull();
    expect(extractStructuredMock).not.toHaveBeenCalled();
  });

  it("erro genérico de extractPdfText (PDF corrompido) retorna null, nunca lança", async () => {
    extractPdfTextMock.mockRejectedValueOnce(new Error("corrupted"));

    const result = await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf");

    expect(result).toBeNull();
  });
});
