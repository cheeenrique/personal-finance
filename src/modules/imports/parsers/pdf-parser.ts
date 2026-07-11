import { callGemini, type GeminiContentPart } from "@/lib/ai/gemini";
import type { ImportParseError, ImportParseResult, ParsedTransaction } from "../types";
import { normalizeTransactionItem, parseTransactionEnvelope } from "./normalize";

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
 *
 * Normalização de item (`normalizeTransactionItem`) e validação da envoltória
 * (`parseTransactionEnvelope`) vivem em `./normalize.ts` — compartilhadas com
 * `card-invoice-parser.ts` (mesmo shape de item produzido pela IA).
 */

/**
 * Extração de PDF via Gemini é lenta (~30–90s pra um extrato real — o modelo
 * lê o documento inteiro e devolve a lista estruturada), muito acima do
 * default de 8s do transporte (voltado a texto/imagem curtos). Sem esta
 * margem a chamada aborta antes de terminar e o extrato inteiro vira o erro
 * genérico "não foi possível extrair". (Thinking já vem desligado por padrão
 * em `callGemini`, o que também derruba a latência.)
 */
const PDF_TIMEOUT_MS = 90_000;

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

  const rawItems = await callGemini(
    [{ parts }],
    "pdf-import-statement",
    PDF_RESPONSE_SCHEMA,
    parseTransactionEnvelope,
    PDF_TIMEOUT_MS,
  );

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
    const result = normalizeTransactionItem(raw);
    if ("error" in result) errors.push(result.error);
    else transactions.push(result.transaction);
  }

  return { transactions, errors };
}
