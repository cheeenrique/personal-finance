import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiExtractor, toGeminiSchema } from "./gemini";
import type { AiModelConfig } from "./types";

const MODEL: AiModelConfig = { provider: "gemini", model: "n/a", modality: "text" };

describe("toGeminiSchema", () => {
  it("converte type pra UPPERCASE recursivamente", () => {
    expect(
      toGeminiSchema({
        type: "object",
        properties: {
          items: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
        },
      }),
    ).toEqual({
      type: "OBJECT",
      properties: {
        items: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" } } } },
      },
    });
  });

  it("preserva enum/required/nullable", () => {
    expect(toGeminiSchema({ type: "string", enum: ["A", "B"], nullable: true })).toEqual({
      type: "STRING",
      enum: ["A", "B"],
      nullable: true,
    });
  });
});

describe("GeminiExtractor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("retorna null sem GEMINI_API_KEY (delega pro callGemini existente)", async () => {
    const extractor = new GeminiExtractor();
    const result = await extractor.extract(
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
      MODEL,
    );
    expect(result).toBeNull();
  });

  it("monta parts de VISÃO com inlineData + text (mesmo shape de financing-parser.ts)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }] }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const extractor = new GeminiExtractor();
    const result = await extractor.extract(
      { kind: "vision", bytes: Buffer.from("bytes"), mimeType: "image/jpeg" },
      "prompt visão",
      { type: "object" },
      (raw) => raw as { ok: boolean },
      MODEL,
    );

    expect(result).toEqual({ ok: true });
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
    expect(body.contents[0].parts[1].text).toBe("prompt visão");
  });
});
