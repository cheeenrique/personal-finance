/**
 * Camada de IA provider-agnóstica (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Arquitetura da camada de IA") — porta (DIP, ~/.claude/rules/01-solid.md): parsers de
 * documento (`modules/imports/parsers/card-invoice-parser.ts`,
 * `modules/telegram/financing-parser.ts`) dependem só de `extractStructured` (`extract.ts`),
 * nunca de um provider concreto (`nvidia.ts`/`gemini.ts`) nem do registry (`models.ts`).
 */

export type AiProvider = "nvidia" | "gemini";

/** Papel semântico da extração — resolve pra um provider+modelo real via `models.ts` (fonte
 * única, "Trocar de modelo/provider = editar o registry, sem tocar em parser"). */
export type AiRole = "document-text" | "document-text-reasoning" | "document-vision";

/** Quirks por modelo repassados como `extra_body`/campos top-level na chamada NVIDIA (ver
 * `nvidia.ts`, `buildExtraBody`) — cada adapter usa só os campos que seu provider entende
 * (Gemini ignora todos, usa seu próprio `thinkingBudget` fixo em `callGemini`). */
export type AiModelParams = {
  /** deepseek: liga/desliga "thinking" (`extra_body.chat_template_kwargs.thinking`). */
  thinking?: boolean;
  /** nemotron: orçamento de raciocínio (`reasoning_budget`). */
  reasoningBudget?: number;
  /** gpt-oss: nível de raciocínio (`reasoning_effort`) — "low" mantém o JSON limpo e rápido
   * (modelos de reasoning senão pensam em texto puro e estouram o max_tokens antes do JSON). */
  reasoningEffort?: "low" | "medium" | "high";
  /** qwen (visão): amostragem — valores do spec (0.6/0.95). */
  temperature?: number;
  topP?: number;
};

export type AiModelConfig = {
  provider: AiProvider;
  model: string;
  modality: "text" | "vision";
  params?: AiModelParams;
  /** Provider de fallback pra esta `role` (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md,
   * correção "Gemini como FALLBACK de provider") — o facade (`extract.ts`) tenta este
   * provider só depois do primário (`provider` acima) esgotar retries e continuar `null`.
   * `undefined` = sem fallback pra esta role (ex.: `document-text-reasoning`, hoje). */
  fallback?: AiProvider;
};

/** `text`: texto já extraído do documento (ex.: `extractPdfText(...).text`) — NUNCA o
 * prompt (esse vai à parte, ver `StructuredExtractor.extract`). `vision`: bytes crus
 * (imagem OU PDF, ver limitação documentada em `card-invoice-parser.ts`) + mimeType. */
export type ExtractionInput =
  | { kind: "text"; text: string }
  | { kind: "vision"; bytes: Buffer; mimeType: string };

/** JSON Schema padrão (draft-like, `type` em lowercase — `"object"`/`"string"`/...) — cada
 * parser define o seu (ver `card-invoice-parser.ts` `INVOICE_RESPONSE_SCHEMA`,
 * `financing-parser.ts` `FINANCING_RESPONSE_SCHEMA`). Adapters convertem pro formato do
 * próprio provider quando precisam (ver `gemini.ts`, `toGeminiSchema`) — NENHUM parser
 * conhece o formato específico de um provider. */
export type JsonSchema = Record<string, unknown>;

export type ExtractOpts = {
  /** Timeout da chamada em ms — default por adapter (documento de fatura/contrato é mais
   * lento que texto curto, ver `nvidia.ts` `DEFAULT_TIMEOUT_MS`). */
  timeoutMs?: number;
};

/**
 * Porta (DIP) — todo adapter de provider implementa isto. NUNCA lança: falha de
 * rede/timeout/parse vira `null`, sempre (erro-como-dado,
 * ~/.claude/rules/06-composition-errors.md; todo adapter honra o mesmo contrato — LSP).
 * `model` é resolvido pelo FACADE (`extract.ts`) a partir da `role` — o adapter só executa
 * a chamada com o modelo/params já decididos, nunca decide ele mesmo qual modelo usar.
 */
export interface StructuredExtractor {
  extract<T>(
    input: ExtractionInput,
    prompt: string,
    schema: JsonSchema,
    parse: (raw: unknown) => T | null,
    model: AiModelConfig,
    opts?: ExtractOpts,
  ): Promise<T | null>;
}
