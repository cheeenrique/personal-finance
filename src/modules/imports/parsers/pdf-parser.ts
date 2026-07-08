import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { callGemini, type GeminiContentPart } from "@/lib/ai/gemini";
import { startOfDaySP } from "@/lib/date/calendar-sp";
import type { ImportParseError, ImportParseResult, ParsedTransaction } from "../types";

/**
 * Parser de PDF de extrato via Gemini
 * (docs/superpowers/specs/2026-07-08-import-multiformato-design.md, "PDF (via
 * Gemini)"). Diferente de CSV/XLSX (determinísticos, `tabular.ts`), o layout
 * de um extrato em PDF varia demais entre bancos pra parse posicional/regex —
 * reusa o mesmo transporte Gemini de `modules/telegram` (`callGemini`,
 * `GeminiContentPart`, agora em `@/lib/ai/gemini.ts`) e o MESMO racional de
 * `telegram/financing-parser.ts` (prompt + `responseSchema` estruturado +
 * validação zod da saída — nunca confiamos cegamente em JSON de LLM).
 *
 * `content` chega em base64 (mesmo caminho binário do XLSX, ver
 * `parsers/index.ts` e `import-modal.tsx`) — o PDF nunca é decodificado pra
 * texto aqui, só repassado como `inlineData` pro Gemini.
 *
 * Falha do Gemini (sem `GEMINI_API_KEY`, timeout, erro de rede, JSON fora do
 * shape esperado) NUNCA estoura — vira `{ transactions: [], errors: [...] }`,
 * mesmo contrato de erro-como-dado dos outros parsers. Um item individual
 * malformado dentro da lista também não descarta o extrato inteiro: vira um
 * `ImportParseError` isolado (mesmo padrão de `parseTabular`/`parseRow`).
 *
 * NUNCA loga o conteúdo do PDF nem a API key (mesmo racional de
 * `ai-parser.ts`/`financing-parser.ts`, docs/30-TELEGRAM.md, "Segurança").
 */

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL_STRING_REGEX = /^\d+(\.\d+)?$/;

const isoDateSchema = z.string().regex(ISO_DATE_REGEX, "esperado YYYY-MM-DD");
const decimalStringSchema = z.string().regex(DECIMAL_STRING_REGEX, "esperado string decimal com ponto");

const pdfTransactionItemSchema = z.object({
  date: isoDateSchema,
  amount: decimalStringSchema,
  type: z.enum(["EXPENSE", "INCOME"]),
  description: z.string().min(1),
});

/** Formato Gemini/OpenAPI do `responseSchema` — envelope `{ transactions: [...] }` (mesmo idioma de array-dentro-de-objeto de `installments` em `financing-parser.ts`). */
const PDF_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    transactions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          amount: { type: "STRING" },
          type: { type: "STRING", enum: ["EXPENSE", "INCOME"] },
          description: { type: "STRING" },
        },
        required: ["date", "amount", "type", "description"],
      },
    },
  },
  required: ["transactions"],
} as const;

function buildPdfPrompt(): string {
  return [
    "Você extrai TODOS os lançamentos de um EXTRATO BANCÁRIO em PDF de um usuário de um app de finanças pessoais (pt-BR). O extrato pode ser de bancos diferentes — o layout muda, mas cada linha de movimentação representa um lançamento (data, valor, descrição/histórico).",
    "",
    "Para CADA lançamento do extrato, preencha um item da lista `transactions` com:",
    '- `date`: data do lançamento no formato ISO YYYY-MM-DD (ano corrente quando o extrato omitir o ano).',
    '- `amount`: valor ABSOLUTO do lançamento (sempre positivo, sem sinal), string decimal com PONTO como separador decimal, SEM separador de milhar e SEM símbolo de moeda (ex.: "150.30"). Se o extrato usa vírgula decimal e ponto de milhar (padrão BR), CONVERTA para ponto decimal.',
    '- `type`: "EXPENSE" quando o dinheiro SAI da conta (débito, pagamento, compra, saque), "INCOME" quando o dinheiro ENTRA (crédito, depósito, recebimento, estorno a favor).',
    "- `description`: descrição/histórico do lançamento como aparece no extrato, resumida.",
    "",
    "Ignore linhas que NÃO são lançamentos (saldo anterior, saldo do dia, saldo final, totais, cabeçalho, rodapé, número de página).",
    "Se o documento não tiver NENHUM lançamento identificável, retorne `transactions: []` — NUNCA invente um lançamento que não está no documento.",
  ].join("\n");
}

/** Só valida a ENVOLTÓRIA (`{ transactions: [...] }`) — cada item é validado individualmente em `normalizeItem`, pra um item malformado virar um erro isolado em vez de descartar o extrato inteiro. */
function parseExtractionEnvelope(rawJson: unknown): unknown[] | null {
  const envelope = z.object({ transactions: z.array(z.unknown()) }).safeParse(rawJson);
  return envelope.success ? envelope.data.transactions : null;
}

function safeSnippet(raw: unknown): string {
  try {
    return JSON.stringify(raw);
  } catch {
    return "";
  }
}

/** Bounds checadas antes de `startOfDaySP` (mesmo racional de `buildDate` em `tabular.ts`) — evita `Date` rolando pra outro mês (ex.: dia 40) silenciosamente. */
function parseIsoDateSP(isoDate: string): Date | null {
  const match = isoDate.match(ISO_DATE_REGEX);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return startOfDaySP(year, month, day);
}

function normalizeItem(raw: unknown): { transaction: ParsedTransaction } | { error: ImportParseError } {
  const parsed = pdfTransactionItemSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: {
        snippet: safeSnippet(raw),
        reason: `Lançamento com formato inesperado: ${parsed.error.issues[0]?.message ?? "erro de validação"}`,
      },
    };
  }

  const date = parseIsoDateSP(parsed.data.date);
  if (!date) {
    return { error: { snippet: safeSnippet(raw), reason: `Data inválida: "${parsed.data.date}"` } };
  }

  return {
    transaction: {
      fitId: null,
      date,
      amount: new Prisma.Decimal(parsed.data.amount).toFixed(2),
      type: parsed.data.type,
      description: parsed.data.description.trim(),
    },
  };
}

/**
 * `base64Content`: bytes do arquivo `.pdf` codificados em base64 (ver
 * contrato no topo do arquivo). `null` do `callGemini` (sem
 * `GEMINI_API_KEY`, timeout, erro de rede, JSON fora do shape esperado) vira
 * um único erro claro pro usuário — sem fallback determinístico possível pra
 * PDF (não dá pra "regex" um extrato de layout arbitrário).
 */
export async function parsePdfStatement(base64Content: string): Promise<ImportParseResult> {
  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType: "application/pdf", data: base64Content } },
    { text: buildPdfPrompt() },
  ];

  const rawItems = await callGemini([{ parts }], "pdf-import-statement", PDF_RESPONSE_SCHEMA, parseExtractionEnvelope);

  if (rawItems === null) {
    return {
      transactions: [],
      errors: [
        {
          snippet: "",
          reason: "Não foi possível extrair as transações do PDF (tente novamente em instantes ou use outro formato).",
        },
      ],
    };
  }

  const transactions: ParsedTransaction[] = [];
  const errors: ImportParseError[] = [];

  for (const raw of rawItems) {
    const result = normalizeItem(raw);
    if ("error" in result) errors.push(result.error);
    else transactions.push(result.transaction);
  }

  return { transactions, errors };
}
