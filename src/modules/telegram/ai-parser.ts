import { z } from "zod";
import type { AiParsedTransaction } from "./types";

/**
 * Parsing de lançamento livre via Gemini Flash (docs/30-TELEGRAM.md, "Parsing
 * por IA") — híbrido com o parser regex (`parser.ts`): só mensagens que
 * cairiam em `create_transaction`/`unknown` passam por aqui (comandos
 * determinísticos como "saldo"/"hoje"/"gastos mes" continuam 100% regex,
 * nunca chamam a IA).
 *
 * REST API via `fetch` nativo — sem SDK (Vercel serverless já tem fetch,
 * ver guard-rail da task). Structured output (`responseSchema`) garante JSON
 * bem-formado; ainda assim validamos com zod (nunca confiar cegamente em
 * saída de LLM, é input externo como qualquer outro).
 */
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 8000;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isTransaction: { type: "BOOLEAN" },
    type: { type: "STRING", enum: ["EXPENSE", "INCOME"] },
    amount: { type: "STRING", nullable: true },
    description: { type: "STRING" },
    date: { type: "STRING", nullable: true },
    categoryName: { type: "STRING", nullable: true },
    paymentMethod: { type: "STRING", enum: ["credit", "debit", "pix", "transfer", "cash"], nullable: true },
    originKind: { type: "STRING", enum: ["account", "card"], nullable: true },
    originName: { type: "STRING", nullable: true },
  },
  required: ["isTransaction", "type", "description"],
} as const;

/** Valida a saída do modelo — nunca confiamos no JSON de um LLM sem checar shape (mesmo com `responseSchema`). */
const aiResponseSchema = z.object({
  isTransaction: z.boolean(),
  type: z.enum(["EXPENSE", "INCOME"]),
  // `amount` nullable (docs/30-TELEGRAM.md, "Fluxo conversacional"): mensagem
  // sem valor numérico vira pergunta em vez de a IA inventar um número.
  amount: z.string().min(1).nullable().optional(),
  description: z.string().min(1),
  date: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  paymentMethod: z.enum(["credit", "debit", "pix", "transfer", "cash"]).nullable().optional(),
  originKind: z.enum(["account", "card"]).nullable().optional(),
  originName: z.string().nullable().optional(),
});

export type AiParserContext = {
  /** `YYYY-MM-DD` em America/Sao_Paulo — referência de "hoje" pra resolver datas relativas. */
  todaySaoPaulo: string;
  /** Nomes das categorias (ambos os tipos) do usuário — a IA escolhe a mais próxima dessa lista. */
  categoryNames: string[];
  /** Nomes das contas ATIVAS do usuário. */
  accountNames: string[];
  /** Nomes dos cartões ATIVOS do usuário. */
  cardNames: string[];
};

function buildPrompt(rawText: string, ctx: AiParserContext): string {
  const categoriesLabel = ctx.categoryNames.length > 0 ? ctx.categoryNames.join(", ") : "(nenhuma cadastrada)";
  const accountsLabel = ctx.accountNames.length > 0 ? ctx.accountNames.join(", ") : "(nenhuma cadastrada)";
  const cardsLabel = ctx.cardNames.length > 0 ? ctx.cardNames.join(", ") : "(nenhum cadastrado)";

  return [
    "Você extrai dados de uma mensagem de lançamento financeiro pessoal (pt-BR) enviada por um usuário a um bot do Telegram.",
    `Data de referência ("hoje"): ${ctx.todaySaoPaulo} (America/Sao_Paulo).`,
    "",
    "Regras:",
    "- isTransaction=false se a mensagem NÃO for um lançamento (saudação, pergunta, texto aleatório sem qualquer menção a gasto/recebimento de dinheiro).",
    '- type: INCOME quando o dinheiro ENTRA pro usuário (ex.: "recebi", "recebido de", "pix recebido", "caiu", salário, freela); EXPENSE quando o dinheiro SAI (ex.: "paguei", "comprei", "pix para", "transferência para", gasto do dia a dia). Assuma EXPENSE quando ambíguo.',
    '- amount: valor decimal em string (ex.: "30" ou "30.50"), sem símbolo de moeda. Se a mensagem NÃO mencionar nenhum valor numérico, retorne null — NUNCA invente um valor.',
    "- description: descrição curta do lançamento (poucas palavras). Pessoa ou empresa EXTERNA citada (ex.: \"mãe\", \"Romeika\", \"Funape\" — alguém que NÃO é o próprio usuário) SEMPRE vai na descrição, nunca é uma conta/cartão do usuário.",
    '- date: resolva datas relativas ("hoje", "ontem", "amanhã") e absolutas ("dia 18/06", "18/06") usando a data de referência acima como "hoje" e o ano corrente quando omitido. Formato YYYY-MM-DD. Se a mensagem não mencionar data, retorne null.',
    `- categoryName: escolha o nome MAIS PRÓXIMO dentre esta lista de categorias do usuário: [${categoriesLabel}]. Se nenhuma for uma boa correspondência, retorne null.`,
    '- paymentMethod: identifique COMO o dinheiro saiu/entrou — "credit" (cartão de crédito), "debit" (cartão de débito), "pix", "transfer" (transferência/TED/DOC), "cash" (dinheiro/espécie). Se a mensagem não mencionar nenhum canal, retorne null.',
    '- originKind/originName: só preencha se o nome citado bater com um item REAL das listas abaixo. Se citar um CARTÃO da lista (geralmente junto de "crédito"/"débito"), originKind="card" e originName = nome EXATO da lista de cartões. Se citar uma CONTA da lista (geralmente junto de "pix"/"transferência"/banco), originKind="account" e originName = nome EXATO da lista de contas. IMPORTANTE: nome de pessoa/empresa EXTERNA (que foi pra description) NUNCA é origem, mesmo aparecendo perto de "pix" ou "transferência". Sem menção de conta/cartão real do usuário, ambos null.',
    `Contas do usuário: [${accountsLabel}]`,
    `Cartões do usuário: [${cardsLabel}]`,
    "",
    `Mensagem do usuário: "${rawText}"`,
  ].join("\n");
}

/**
 * `null` em qualquer falha (sem `GEMINI_API_KEY`, erro de rede, timeout,
 * resposta não-2xx, JSON inválido/fora do shape esperado) — o chamador
 * (`handlers.ts`) sempre tem um fallback determinístico (parser regex) pra
 * esses casos. NUNCA lança — webhook do Telegram não pode quebrar por causa
 * de uma dependência externa opcional. NUNCA loga `rawText` nem a API key
 * (docs/30-TELEGRAM.md, "Segurança").
 */
export async function parseTransactionWithAI(
  rawText: string,
  ctx: AiParserContext,
): Promise<AiParsedTransaction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(rawText, ctx) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      console.error("[modules/telegram] gemini request failed", { status: response.status });
      return null;
    }

    const body = (await response.json().catch(() => null)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      | null;
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;

    const rawJson: unknown = JSON.parse(text);
    const parsed = aiResponseSchema.safeParse(rawJson);
    if (!parsed.success) return null;

    return {
      isTransaction: parsed.data.isTransaction,
      type: parsed.data.type,
      amount: parsed.data.amount ?? null,
      description: parsed.data.description,
      date: parsed.data.date ?? null,
      categoryName: parsed.data.categoryName ?? null,
      paymentMethod: parsed.data.paymentMethod ?? null,
      originKind: parsed.data.originKind ?? null,
      originName: parsed.data.originName ?? null,
    };
  } catch (error) {
    console.error("[modules/telegram] gemini parse failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
