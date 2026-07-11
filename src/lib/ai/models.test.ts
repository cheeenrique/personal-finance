import { describe, expect, it } from "vitest";
import { resolveAiModel } from "./models";

describe("resolveAiModel", () => {
  it("document-text resolve pra nvidia gpt-oss-120b com reasoning_effort low + fallback gemini", () => {
    const config = resolveAiModel("document-text");
    expect(config).toEqual({
      provider: "nvidia",
      model: "openai/gpt-oss-120b",
      modality: "text",
      params: { reasoningEffort: "low" },
      fallback: "gemini",
    });
  });

  it("document-vision resolve pra nvidia nemotron-nano-vl + fallback gemini", () => {
    const config = resolveAiModel("document-vision");
    expect(config.provider).toBe("nvidia");
    expect(config.model).toBe("nvidia/nemotron-nano-12b-v2-vl");
    expect(config.modality).toBe("vision");
    expect(config.fallback).toBe("gemini");
  });
});
