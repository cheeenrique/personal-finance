import { describe, expect, it } from "vitest";
import { resolveAiModel } from "./models";

describe("resolveAiModel", () => {
  it("document-text resolve pra nvidia deepseek com thinking desligado + fallback gemini", () => {
    const config = resolveAiModel("document-text");
    expect(config).toEqual({
      provider: "nvidia",
      model: "deepseek-ai/deepseek-v4-flash",
      modality: "text",
      params: { thinking: false },
      fallback: "gemini",
    });
  });

  it("document-vision resolve pra nvidia qwen + fallback gemini", () => {
    const config = resolveAiModel("document-vision");
    expect(config.provider).toBe("nvidia");
    expect(config.model).toBe("qwen/qwen3.5-397b-a17b");
    expect(config.modality).toBe("vision");
    expect(config.fallback).toBe("gemini");
  });

  it("document-text-reasoning resolve pra nemotron com reasoning_budget, SEM fallback", () => {
    const config = resolveAiModel("document-text-reasoning");
    expect(config.model).toBe("nvidia/nemotron-3-nano-30b-a3b");
    expect(config.params?.reasoningBudget).toBeGreaterThan(0);
    expect(config.fallback).toBeUndefined();
  });
});
