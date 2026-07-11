import type { AiModelConfig, AiRole } from "./types";

/**
 * Registry central de modelos (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Registry de modelos") — FONTE ÚNICA de qual provider/modelo (+ fallback) cada `role`
 * usa. Trocar de modelo/fallback é editar esta constante, nunca um parser (OCP,
 * ~/.claude/rules/01-solid.md).
 *
 * `fallback: "gemini"` em `document-text`/`document-vision` — Gemini NUNCA é
 * desabilitado (instrução do dono): se o provider primário (NVIDIA) esgotar (rate
 * limit/timeout/JSON inválido), o facade (`extract.ts`) tenta Gemini antes de devolver
 * `null`. `document-text-reasoning` fica sem fallback por ora (YAGNI — role pouco
 * usado, ver T13).
 *
 * `reasoningBudget` de `document-text-reasoning`: 1024 tokens de raciocínio — valor
 * inicial conservador; role NUNCA é o default de nenhum parser (thinking/reasoning OFF
 * por padrão é invariante global) — só entra em uso manual/opt-in se medição concreta
 * mostrar confusão de campo (ver T13, nota sobre upgrade condicional).
 */
const REGISTRY: Record<AiRole, AiModelConfig> = {
  "document-text": {
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-pro",
    modality: "text",
    params: { thinking: false },
    fallback: "gemini",
  },
  "document-text-reasoning": {
    provider: "nvidia",
    model: "nvidia/nemotron-3-nano-30b-a3b",
    modality: "text",
    params: { reasoningBudget: 1024 },
  },
  "document-vision": {
    provider: "nvidia",
    model: "qwen/qwen3.5-397b-a17b",
    modality: "vision",
    params: { temperature: 0.6, topP: 0.95 },
    fallback: "gemini",
  },
};

export function resolveAiModel(role: AiRole): AiModelConfig {
  return REGISTRY[role];
}
