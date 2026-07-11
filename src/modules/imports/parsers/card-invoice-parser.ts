import { extractPdfText, PdfPasswordError } from "@/lib/pdf/extract-text";
import { extractStructured } from "@/lib/ai/extract";
import type { JsonSchema } from "@/lib/ai/types";
import type { ImportParseError, ImportParseResult, ParsedTransaction } from "../types";
import { normalizeTransactionItem, parseTransactionEnvelope } from "./normalize";

/**
 * Parser de FATURA de cartão em PDF (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Fluxo 1") — via camada de IA nova (`@/lib/ai/extract`), NUNCA chama `nvidia.ts`/`gemini.ts`
 * direto (DIP — só conhece a porta `extractStructured`, nem sabe que hoje é NVIDIA).
 *
 * PDF com text layer → `extractPdfText` → texto → `role: "document-text"` (gpt-oss,
 * text-only). PDF escaneado/foto (sem text layer) → `role: "document-vision"` (VLM nemotron) —
 * ATENÇÃO: este caminho manda os BYTES CRUS do PDF como `image_url` com
 * `mimeType: "application/pdf"`; se o spike (T2) confirmar que o qwen da NIM não aceita PDF
 * inline pra visão (só imagem rasterizada), essa combinação específica retorna `null` (vira
 * o erro genérico abaixo) até uma melhoria futura de renderizar a 1ª página em PNG (fora de
 * escopo deste plano — precisaria de `sharp` + `unpdf/extractImages`, ver "Improvement
 * Suggestions" no relatório da tarefa).
 *
 * Regras de linha (spec, "Fatura — linhas"): compras + encargos = EXPENSE; estornos/devolução
 * de compra = INCOME; PAGAMENTO DA FATURA (linha de crédito que representa o titular pagando
 * a fatura, ex. "Pagamento em 04 JUN") / saldo anterior = IGNORADOS (nem aparecem no
 * envelope) — mesmo sendo um crédito na fatura, pagamento de fatura NUNCA é INCOME (bug real:
 * já vazou pro preview inflando "Entradas a importar", ver `buildInvoicePrompt`). Parcela =
 * gasto flat — cada linha de parcela vira 1 EXPENSE isolada (agrupamento em
 * `InstallmentPurchase` é fase 2, fora deste parser).
 *
 * NUNCA lança: senha errada/faltando (`PdfPasswordError`) e falha de extração (IA fora do
 * ar, JSON malformado) viram `ImportParseError` isolado — mesmo contrato de
 * `pdf-parser.ts`/`ofx-parser.ts`/`csv-parser.ts`. NUNCA loga o texto do documento nem a
 * senha (mesmo racional de `lib/ai/gemini.ts`).
 *
 * Cada item também pede `categoryName` (`suggestedCategoryName` em `ParsedTransaction`) — a
 * IA sugere uma categoria a partir do estabelecimento (bug real: 1º import de cartão sempre
 * caía "Sem categoria" porque a única sugestão vinha do histórico, `lastCategoryForDescription`,
 * vazio nesse caso). `previewImport` (`../service.ts`) casa essa sugestão contra as categorias
 * REAIS do usuário antes de usar — nunca inventa categoria nova a partir do texto solto da IA.
 * SÓ este parser manda `categoryName`; `pdf-parser.ts` de extrato não pede no prompt, contrato
 * de extrato inalterado.
 */

/** Extração de documento é lenta (modelo lê a fatura inteira + gera JSON) — 90s cobre o
 * NVIDIA (gpt-oss reasoning low ~5s, com folga) E o fallback Gemini (que sem isso usaria o
 * default curto de `callGemini` e abortava no documento). Abaixo do maxDuration serverless. */
const DOCUMENT_TIMEOUT_MS = 90_000;

const INVOICE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          amount: { type: "string" },
          type: { type: "string", enum: ["EXPENSE", "INCOME"] },
          description: { type: "string" },
          categoryName: { type: "string", nullable: true },
        },
        required: ["date", "amount", "type", "description"],
      },
    },
  },
  required: ["transactions"],
};

function buildInvoicePrompt(): string {
  return [
    "Você extrai TODOS os lançamentos de uma FATURA DE CARTÃO DE CRÉDITO (pt-BR) de bancos diferentes — o layout muda, mas cada linha de compra/encargo/estorno representa um lançamento.",
    "",
    "Para CADA lançamento da fatura, preencha um item de `transactions` com:",
    '- `date`: data da COMPRA (não a data de vencimento da fatura), formato ISO YYYY-MM-DD (ano corrente quando a fatura omitir o ano).',
    '- `amount`: valor ABSOLUTO (sempre positivo, sem sinal), string decimal com PONTO decimal, sem separador de milhar e sem símbolo de moeda (ex.: "150.30"). Converta vírgula decimal (padrão BR) para ponto.',
    '- `type`: "EXPENSE" pra compras E encargos (juros, IOF, anuidade, multa) — "INCOME" SÓ pra estorno/devolução de uma COMPRA (crédito que anula uma compra específica feita antes).',
    "- `description`: descrição da compra como aparece na fatura (nome do estabelecimento), resumida.",
    '- `categoryName`: sua MELHOR sugestão de categoria pra esse lançamento, a partir do nome do estabelecimento/descrição (ex.: "AZUL SEGUROS" → "Seguros"; "IOF TRANSACOES" → "Impostos"; "KaBuM" → "Informática"; assinatura de software/streaming (ex. "ANTHROPIC", "NETFLIX") → "Assinaturas"; "iFood"/restaurante → "Alimentação"; posto de combustível → "Transporte"). Categoria genérica em pt-BR, NUNCA o nome exato de uma categoria que você não viu na fatura. Sem certeza nenhuma → `null`, nunca force um palpite ruim.',
    "",
    'Se a compra estiver PARCELADA (ex.: "Loja X 3/12"), cada parcela listada na fatura é um item INDEPENDENTE — NÃO some as parcelas, NÃO tente reconstruir o valor total da compra, cada linha vira 1 item.',
    "",
    "IGNORE completamente (NÃO viram item — nem EXPENSE nem INCOME): QUALQUER linha de PAGAMENTO DA FATURA. É pagamento da fatura toda descrição que começa com \"Pagamento\"/\"PAGAMENTO\"/\"Pagto\"/\"Pgto\", INDEPENDENTE do canal que vier depois — inclui \"PAGAMENTO PIX\", \"PAGAMENTO BOLETO\", \"PAGAMENTO DEBITO AUTOMATICO\", \"PAGAMENTO EFETUADO\", \"Pagamento em 04 JUN\", \"Pagamento recebido\", \"Pagto fatura\". Ignore TAMBÉM: saldo anterior, total da fatura, limite disponível, cabeçalho, rodapé, número de página.",
    "ATENÇÃO CRÍTICA: pagamento da fatura é o titular QUITANDO a fatura (o dinheiro que ele pagou pra abater a fatura) — NÃO é compra nem estorno. Pode vir com sinal NEGATIVO ou POSITIVO na fatura; em QUALQUER caso é IGNORADO, NUNCA vira lançamento (nem EXPENSE nem INCOME) — senão o valor conta em dobro (as compras já foram lançadas). \"PAGAMENTO PIX\" É pagamento da fatura → IGNORE. Só é INCOME o ESTORNO/DEVOLUÇÃO de UMA compra específica (ex.: \"Estorno Loja X\", \"Devolução compra\"). Na dúvida, se a descrição tem \"Pagamento\", IGNORE.",
    "Se a fatura não tiver NENHUM lançamento identificável, retorne `transactions: []` — NUNCA invente um lançamento que não está no documento.",
  ].join("\n");
}

function buildErrorResult(reason: string): ImportParseResult {
  return { transactions: [], errors: [{ snippet: "", reason }] };
}

export async function parseCardInvoice(bytes: Buffer, password?: string): Promise<ImportParseResult> {
  let extraction: { text: string; hasTextLayer: boolean };
  try {
    extraction = await extractPdfText(bytes, password);
  } catch (error) {
    if (error instanceof PdfPasswordError) {
      return buildErrorResult("PDF protegido por senha — senha incorreta ou não informada.");
    }
    console.error("[modules/imports/parsers/card-invoice-parser] extractPdfText failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return buildErrorResult("Não foi possível ler o PDF da fatura.");
  }

  const prompt = buildInvoicePrompt();
  const rawItems = extraction.hasTextLayer
    ? await extractStructured("document-text", { kind: "text", text: extraction.text }, prompt, INVOICE_RESPONSE_SCHEMA, parseTransactionEnvelope, { timeoutMs: DOCUMENT_TIMEOUT_MS })
    : await extractStructured("document-vision", { kind: "vision", bytes, mimeType: "application/pdf" }, prompt, INVOICE_RESPONSE_SCHEMA, parseTransactionEnvelope, { timeoutMs: DOCUMENT_TIMEOUT_MS });

  if (rawItems === null) {
    return buildErrorResult("Não foi possível extrair os lançamentos da fatura (tente novamente em instantes).");
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
