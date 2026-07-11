import { resolveAiModel } from "./models";
import { NvidiaNimExtractor } from "./nvidia";
import { GeminiExtractor } from "./gemini";
import type { AiModelConfig, AiProvider, AiRole, ExtractionInput, ExtractOpts, JsonSchema, StructuredExtractor } from "./types";

/**
 * Facade central da camada de IA (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Facade (extractStructured)") — ÚNICO ponto que parsers de documento chamam. Resolve
 * `role` → `{provider, model, params, fallback}` no registry (`models.ts`), delega pro
 * adapter certo (SRP/DIP: parser não conhece provider/modelo/quirk de request).
 *
 * Cadeia de tentativas (nunca lança — erro-como-dado, mesmo contrato de
 * `StructuredExtractor`): 1) provider PRIMÁRIO; 2) RETRY do mesmo provider (hiccup
 * transitório); 3) provider de FALLBACK do registry, se `model.fallback` existir —
 * Gemini nunca é desabilitado, é a rede de segurança quando o primário (NVIDIA) esgota
 * (rate limit/timeout/JSON fora do shape); 4) `null`.
 */

const nvidiaExtractor = new NvidiaNimExtractor();
const geminiExtractor = new GeminiExtractor();

function extractorFor(provider: AiProvider): StructuredExtractor {
  return provider === "nvidia" ? nvidiaExtractor : geminiExtractor;
}

/** `GeminiExtractor.extract` ignora o campo `model` (usa o modelo fixo `GEMINI_MODEL`
 * interno, ver `gemini.ts`) — este rótulo só existe pra logging/depuração, nunca é
 * enviado numa request real. */
const FALLBACK_MODEL_LABEL = "gemini (fallback)";

function buildFallbackModel(provider: AiProvider, modality: AiModelConfig["modality"]): AiModelConfig {
  return { provider, model: FALLBACK_MODEL_LABEL, modality };
}

export async function extractStructured<T>(
  role: AiRole,
  input: ExtractionInput,
  prompt: string,
  schema: JsonSchema,
  parse: (raw: unknown) => T | null,
  opts?: ExtractOpts,
): Promise<T | null> {
  const model = resolveAiModel(role);
  const primary = extractorFor(model.provider);

  const firstAttempt = await primary.extract(input, prompt, schema, parse, model, opts);
  if (firstAttempt !== null) return firstAttempt;

  const retryAttempt = await primary.extract(input, prompt, schema, parse, model, opts);
  if (retryAttempt !== null) return retryAttempt;

  if (!model.fallback) return null;

  const fallbackExtractor = extractorFor(model.fallback);
  return fallbackExtractor.extract(input, prompt, schema, parse, buildFallbackModel(model.fallback, model.modality), opts);
}
