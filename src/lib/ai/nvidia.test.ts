import { afterEach, describe, expect, it, vi } from "vitest";
import { NvidiaNimExtractor } from "./nvidia";
import type { AiModelConfig } from "./types";

const TEXT_MODEL: AiModelConfig = {
  provider: "nvidia",
  model: "deepseek-ai/deepseek-v4-pro",
  modality: "text",
  params: { thinking: false },
};

const VISION_MODEL: AiModelConfig = {
  provider: "nvidia",
  model: "qwen/qwen3.5-397b-a17b",
  modality: "vision",
  params: { temperature: 0.6, topP: 0.95 },
};

function jsonResponse(content: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  } as Response;
}

describe("NvidiaNimExtractor", () => {
  const extractor = new NvidiaNimExtractor();

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NVIDIA_API_KEY;
  });

  it("retorna null sem NVIDIA_API_KEY, sem chamar fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await extractor.extract(
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
      TEXT_MODEL,
    );

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("monta messages de TEXTO com prompt + schema + texto do documento", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchSpy);

    const parse = (raw: unknown) => raw as { ok: boolean };
    const result = await extractor.extract(
      { kind: "text", text: "TEXTO DO DOCUMENTO" },
      "PROMPT AQUI",
      { type: "object", properties: { ok: { type: "boolean" } } },
      parse,
      TEXT_MODEL,
    );

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-ai/deepseek-v4-pro");
    expect(body.stream).toBe(false);
    // params do modelo vão no TOPO do body (NIM rejeita `extra_body` literal), não aninhados.
    expect(body.extra_body).toBeUndefined();
    expect(body.chat_template_kwargs).toEqual({ thinking: false });
    expect(body.messages[0].content).toContain("PROMPT AQUI");
    expect(body.messages[0].content).toContain("TEXTO DO DOCUMENTO");
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("monta messages de VISÃO com content array (text + image_url data URL)", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchSpy);

    await extractor.extract(
      { kind: "vision", bytes: Buffer.from("fake-bytes"), mimeType: "image/jpeg" },
      "PROMPT VISÃO",
      { type: "object" },
      (raw) => raw,
      VISION_MODEL,
    );

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(Array.isArray(body.messages[0].content)).toBe(true);
    expect(body.messages[0].content[0]).toEqual({ type: "text", text: expect.stringContaining("PROMPT VISÃO") });
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.temperature).toBe(0.6);
    expect(body.top_p).toBe(0.95);
  });

  it("retorna null em resposta não-2xx, sem lançar", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "erro interno" } as Response));

    const result = await extractor.extract(
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
      TEXT_MODEL,
    );
    expect(result).toBeNull();
  });

  it("retorna null quando o content não é JSON parseável, sem lançar", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("isto não é json nem tem chaves")));

    const result = await extractor.extract(
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
      TEXT_MODEL,
    );
    expect(result).toBeNull();
  });

  it("extrai JSON envolto em texto/markdown (fallback de regex)", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    const content = 'Aqui está o resultado:\n```json\n{"ok":true}\n```';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(content)));

    const result = await extractor.extract(
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw as { ok: boolean },
      TEXT_MODEL,
    );
    expect(result).toEqual({ ok: true });
  });

  it("retorna null quando fetch lança (rede/timeout), sem propagar a exception", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await extractor.extract(
      { kind: "text", text: "doc" },
      "prompt",
      { type: "object" },
      (raw) => raw,
      TEXT_MODEL,
    );
    expect(result).toBeNull();
  });
});
