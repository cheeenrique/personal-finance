import { afterEach, describe, expect, it, vi } from "vitest";

const nvidiaExtractMock = vi.fn();
const geminiExtractMock = vi.fn();

vi.mock("./nvidia", () => ({
  NvidiaNimExtractor: vi.fn().mockImplementation(function () {
    return { extract: nvidiaExtractMock };
  }),
}));
vi.mock("./gemini", () => ({
  GeminiExtractor: vi.fn().mockImplementation(function () {
    return { extract: geminiExtractMock };
  }),
}));

const { extractStructured } = await import("./extract");

describe("extractStructured", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("1ª tentativa do primário (nvidia) sucede — Gemini nunca é chamado", async () => {
    nvidiaExtractMock.mockResolvedValueOnce({ ok: true });

    const result = await extractStructured(
      "document-text",
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
    );

    expect(result).toEqual({ ok: true });
    expect(nvidiaExtractMock).toHaveBeenCalledTimes(1);
    const [, , , , model] = nvidiaExtractMock.mock.calls[0];
    expect(model.model).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(geminiExtractMock).not.toHaveBeenCalled();
  });

  it("retry do MESMO provider: 1ª tentativa null, 2ª sucede — Gemini nunca é chamado", async () => {
    nvidiaExtractMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ok: true });

    const result = await extractStructured(
      "document-text",
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
    );

    expect(result).toEqual({ ok: true });
    expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
    expect(geminiExtractMock).not.toHaveBeenCalled();
  });

  it("FALLBACK: primário (nvidia) esgota 1ª+retry com null → Gemini é chamado → retorna válido", async () => {
    nvidiaExtractMock.mockResolvedValue(null);
    geminiExtractMock.mockResolvedValueOnce({ ok: true, source: "gemini" });

    const result = await extractStructured(
      "document-vision",
      { kind: "vision", bytes: Buffer.from("x"), mimeType: "image/png" },
      "prompt",
      { type: "object" },
      (raw) => raw,
    );

    expect(result).toEqual({ ok: true, source: "gemini" });
    expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
    expect(geminiExtractMock).toHaveBeenCalledTimes(1);
    const [, , , , fallbackModel] = geminiExtractMock.mock.calls[0];
    expect(fallbackModel.provider).toBe("gemini");
  });

  it("primário E fallback esgotam → null, sem lançar", async () => {
    nvidiaExtractMock.mockResolvedValue(null);
    geminiExtractMock.mockResolvedValue(null);

    const result = await extractStructured(
      "document-vision",
      { kind: "vision", bytes: Buffer.from("x"), mimeType: "image/png" },
      "prompt",
      { type: "object" },
      (raw) => raw,
    );

    expect(result).toBeNull();
    expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
    expect(geminiExtractMock).toHaveBeenCalledTimes(1);
  });

  it("role SEM fallback configurado (document-text-reasoning) nunca chama Gemini, mesmo esgotando retry", async () => {
    nvidiaExtractMock.mockResolvedValue(null);

    const result = await extractStructured(
      "document-text-reasoning",
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
    );

    expect(result).toBeNull();
    expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
    expect(geminiExtractMock).not.toHaveBeenCalled();
  });
});
