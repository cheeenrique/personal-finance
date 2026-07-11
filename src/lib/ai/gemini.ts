/**
 * Transporte genérico do Gemini (REST via `fetch` nativo, sem SDK) —
 * compartilhado por `modules/telegram` (transação texto/imagem, documento de
 * financiamento, `ai-parser.ts`/`financing-parser.ts`) e
 * `modules/imports/parsers/pdf-parser.ts` (extrato em PDF,
 * docs/superpowers/specs/2026-07-08-import-multiformato-design.md). Infra
 * pura (HTTP + timeout + tratamento de erro→null) — prompt, `responseSchema`
 * e validação zod de cada caso de uso continuam no módulo de domínio que os
 * usa; este arquivo não conhece transação/financiamento/extrato.
 *
 * `null` em qualquer falha (sem `GEMINI_API_KEY`, erro de rede, timeout,
 * resposta não-2xx, JSON inválido/fora do shape esperado — `parseResponse`
 * decide isso) — NUNCA lança; cada caller decide o fallback (webhook do
 * Telegram não pode quebrar por causa de uma dependência externa opcional;
 * import de PDF cai em `{ transactions: [], errors: [...] }`). NUNCA loga o
 * conteúdo de `contents` (texto do usuário/bytes de imagem/documento) nem a
 * API key.
 */
// gemini-3.1-flash-lite: mais rápido e barato que 2.5-flash pras nossas tarefas
// (extração de PDF/parse estruturado, não raciocínio), free tier bem mais folgado
// (500 req/dia vs 20 do 2.5-flash, que vivia estourando a cota). 2.5-flash-lite
// foi descontinuado pra contas novas (404). Vale pra TODOS os callers (import + telegram).
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 8000;

/** Parte de um `content` da API Gemini — texto puro ou bytes inline (imagem/PDF/áudio) em base64. */
export type GeminiContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Chamada Gemini genérica. `responseSchema` (formato Gemini/OpenAPI) e
 * `parseResponse` (valida com zod + mapeia pro tipo final do caller) são
 * parametrizados pra reuso — só o `contents` e o shape esperado mudam entre
 * os casos de uso; a chamada HTTP/timeout/tratamento de erro é idêntica
 * (rule 02-dry-kiss-yagni, DRY a partir do 2º caso concreto real). `source`
 * só rotula os logs pra diferenciar qual caminho falhou.
 * `timeoutMs` opcional — voz precisa de mais tempo que texto (default 8s).
 */
export async function callGemini<T>(
  contents: Array<{ parts: GeminiContentPart[] }>,
  source: string,
  responseSchema: object,
  parseResponse: (rawJson: unknown) => T | null,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  /** "Thinking" do Gemini desligado por padrão (`0`) em TODAS as chamadas — nossas tarefas (extração/parse estruturado) não precisam de raciocínio e o thinking só custa latência/tokens/cota. Decisão do dono do projeto. */
  thinkingBudget: number = 0,
): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          thinkingConfig: { thinkingBudget },
        },
      }),
    });

    if (!response.ok) {
      // Corpo do erro do Google (status + mensagem — ex.: API_KEY_INVALID,
      // payload grande, quota). NÃO contém o conteúdo enviado (`contents`);
      // é a explicação do próprio Gemini, essencial pra diagnosticar em vez
      // de engolir tudo numa mensagem genérica.
      const detail = await response.text().catch(() => "");
      console.error(`[lib/ai/gemini] ${source} request failed`, { status: response.status, detail: detail.slice(0, 300) });
      return null;
    }

    const body = (await response.json().catch(() => null)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      | null;
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;

    const rawJson: unknown = JSON.parse(text);
    return parseResponse(rawJson);
  } catch (error) {
    console.error(`[lib/ai/gemini] ${source} parse failed`, {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
