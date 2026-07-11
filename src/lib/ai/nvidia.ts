import type { AiModelConfig, ExtractionInput, ExtractOpts, JsonSchema, StructuredExtractor } from "./types";

/**
 * Decisão do spike (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T2):
 * spike SKIPPED — chave NVIDIA_API_KEY ainda não estava disponível no `.env` no momento
 * desta task, então se `response_format`/`guided_json` são suportados pelo NIM segue
 * UNVERIFICADO. Baseline implementado aqui independe do resultado: prompt-constrained
 * (schema embutido no prompt) + validação zod (`extract.ts`) — funciona mesmo se
 * `response_format` estruturado não for suportado pelo modelo.
 *
 * `NvidiaNimExtractor` — adapter OpenAI-compatible pro NVIDIA NIM
 * (`https://integrate.api.nvidia.com/v1/chat/completions`). Isola os quirks por
 * modalidade (SRP, ~/.claude/rules/01-solid.md): texto → `messages[0].content` string;
 * visão → `content` array (`text` + `image_url` data URL base64). `extra_body` varia por
 * modelo (`thinking` pro deepseek, `reasoning_budget` pro nemotron) — decidido só a
 * partir de `model.params` (nunca hardcoded aqui, o registry é a fonte única).
 *
 * NUNCA lança (erro-como-dado): sem `NVIDIA_API_KEY`, timeout, resposta não-2xx, JSON
 * fora do shape esperado → `null`. NUNCA loga bytes do documento nem a API key.
 */

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 16_384;

type NvidiaContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type NvidiaMessage = { role: "user"; content: string | NvidiaContentPart[] };

/** Prompt + schema (embutido como texto — ver decisão de spike acima) sempre juntos; o
 * texto do DOCUMENTO só entra pro caso `text` (visão manda os bytes como imagem à parte). */
function buildInstruction(prompt: string, schema: JsonSchema): string {
  return [
    prompt,
    "",
    "Responda SOMENTE com um JSON válido (sem markdown, sem texto antes/depois) seguindo este schema:",
    JSON.stringify(schema),
  ].join("\n");
}

function buildMessages(input: ExtractionInput, prompt: string, schema: JsonSchema): NvidiaMessage[] {
  const instruction = buildInstruction(prompt, schema);

  if (input.kind === "text") {
    return [{ role: "user", content: `${instruction}\n\nDocumento:\n${input.text}` }];
  }

  return [
    {
      role: "user",
      content: [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.bytes.toString("base64")}` } },
      ],
    },
  ];
}

/**
 * Params específicos do modelo (`chat_template_kwargs` pro deepseek, `reasoning_budget`
 * pro nemotron) — vão no TOPO do body. NIM (REST) NÃO aceita `extra_body` (isso é
 * conceito do SDK Python da OpenAI, que MESCLA o `extra_body` no corpo antes de enviar);
 * mandar `extra_body` literal retorna `400 Unsupported parameter(s): extra_body`.
 */
function buildModelParams(config: AiModelConfig): Record<string, unknown> | undefined {
  if (config.params?.thinking !== undefined) {
    return { chat_template_kwargs: { thinking: config.params.thinking } };
  }
  if (config.params?.reasoningBudget !== undefined) {
    return { reasoning_budget: config.params.reasoningBudget };
  }
  return undefined;
}

/** `choices[0].message.content` às vezes vem cru (JSON puro) ou envolto em texto/markdown
 * (` ```json ... ``` `) mesmo com instrução explícita — tenta direto, cai pro 1º bloco
 * `{...}` encontrado via regex antes de desistir. Remove antes o bloco de raciocínio
 * `<think>…</think>` (modelos de reasoning tipo nemotron emitem mesmo com thinking off) —
 * senão a regex `{…}` poderia casar chaves dentro do raciocínio em vez do JSON de saída. */
function extractJsonFromContent(rawContent: string): unknown | null {
  const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export class NvidiaNimExtractor implements StructuredExtractor {
  async extract<T>(
    input: ExtractionInput,
    prompt: string,
    schema: JsonSchema,
    parse: (raw: unknown) => T | null,
    model: AiModelConfig,
    opts?: ExtractOpts,
  ): Promise<T | null> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model: model.model,
        messages: buildMessages(input, prompt, schema),
        max_tokens: MAX_TOKENS,
        stream: false,
      };
      const modelParams = buildModelParams(model);
      if (modelParams) Object.assign(body, modelParams);
      if (model.params?.temperature !== undefined) body.temperature = model.params.temperature;
      if (model.params?.topP !== undefined) body.top_p = model.params.topP;

      const response = await fetch(NVIDIA_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("[lib/ai/nvidia] request failed", { status: response.status, detail: detail.slice(0, 300) });
        return null;
      }

      const json = (await response.json().catch(() => null)) as
        | { choices?: Array<{ message?: { content?: string } }> }
        | null;
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return null;

      const rawJson = extractJsonFromContent(content);
      if (rawJson === null) return null;

      return parse(rawJson);
    } catch (error) {
      console.error("[lib/ai/nvidia] extract failed", { reason: error instanceof Error ? error.name : "unknown" });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
