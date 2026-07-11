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
    // gpt-oss-120b com reasoning_effort "low": honesto (null em vez de alucinar), extrai a
    // fatura/contrato completos, ignora pagamento de fatura, ~5s. Melhor que nemotron-30b
    // (fraco/alucinava), nemotron-super-120b (pensa em texto puro e estoura max_tokens antes
    // do JSON) e deepseek-pro (enfileira). deepseek-v4-flash morreu 404.
    model: "openai/gpt-oss-120b",
    modality: "text",
    params: { reasoningEffort: "low" },
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
    // nemotron-nano-12b-v2-vl: rápido (~2-4s) e detecta 1 OU VÁRIAS transações num print de
    // notificação (spike medido) — qwen-397b acerta mas enfileira 11-60s; llama-3.2-vision
    // falha em notificação (devolve texto cru). Rápido importa (caminho de imagem do Telegram).
    model: "nvidia/nemotron-nano-12b-v2-vl",
    modality: "vision",
    params: {},
    fallback: "gemini",
  },
};

export function resolveAiModel(role: AiRole): AiModelConfig {
  return REGISTRY[role];
}
