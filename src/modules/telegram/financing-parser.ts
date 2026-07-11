import { z } from "zod";
import type { ParsedFinancing } from "./types";
import { extractPdfText, PdfPasswordError } from "@/lib/pdf/extract-text";
import { extractStructured } from "@/lib/ai/extract";
import type { JsonSchema } from "@/lib/ai/types";

/**
 * Parsing de um DOCUMENTO de financiamento (CCB/contrato de banco, PDF ou
 * foto) via camada de IA (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md).
 * PDF com text layer usa `role: "document-text"` (deepseek, `thinking:false`)
 * — o MESMO role da fatura de cartão, sem tratamento especial pra contrato.
 * PDF escaneado (sem text layer) ou foto direta usa `role: "document-vision"`
 * (qwen) — mesmo caminho de `card-invoice-parser.ts`. Ver
 * `parseFinancingFromDocument` mais abaixo pro racional completo.
 *
 * NUNCA loga o conteúdo do documento, a senha nem a API key
 * (docs/30-TELEGRAM.md, "Segurança").
 */

const decimalStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "expected decimal string with dot separator");

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const INTEREST_PERIOD_VALUES = ["MONTHLY", "ANNUAL"] as const;
const AMORTIZATION_SYSTEM_VALUES = ["PRICE", "SAC", "CUSTOM"] as const;

const parsedFinancingInstallmentSchema = z.object({
  amount: decimalStringSchema,
  dueDate: isoDateSchema,
});

/**
 * Valida a saída bruta do Gemini pro parsing de financiamento — mesmo
 * racional de `aiResponseSchema` (`ai-parser.ts`): nunca confiamos em JSON de
 * LLM sem checar shape, mesmo com `responseSchema` estruturado do lado do
 * Gemini. Todo campo nullable/optional — o documento pode não trazer
 * qualquer um deles, e o Gemini é instruído a retornar `null` em vez de
 * inventar (ver `buildFinancingPrompt`).
 */
export const parsedFinancingSchema = z.object({
  description: z.string().min(1).nullable().optional(),
  lender: z.string().min(1).nullable().optional(),
  operationRef: z.string().min(1).nullable().optional(),
  principal: decimalStringSchema.nullable().optional(),
  downPayment: decimalStringSchema.nullable().optional(),
  assetValue: decimalStringSchema.nullable().optional(),
  assetDescription: z.string().min(1).nullable().optional(),
  installmentsCount: z.number().int().positive().nullable().optional(),
  installmentAmount: decimalStringSchema.nullable().optional(),
  totalToPay: decimalStringSchema.nullable().optional(),
  firstDueDate: isoDateSchema.nullable().optional(),
  interestRate: decimalStringSchema.nullable().optional(),
  interestPeriod: z.enum(INTEREST_PERIOD_VALUES).nullable().optional(),
  cet: decimalStringSchema.nullable().optional(),
  amortizationSystem: z.enum(AMORTIZATION_SYSTEM_VALUES).nullable().optional(),
  financedTaxes: decimalStringSchema.nullable().optional(),
  financedInsurance: decimalStringSchema.nullable().optional(),
  financedFees: decimalStringSchema.nullable().optional(),
  installments: z.array(parsedFinancingInstallmentSchema).nullable().optional(),
});

/** JSON Schema padrão (lowercase) do `responseSchema` — espelha `parsedFinancingSchema`
 * acima (structured output, mesmo formato usado por `card-invoice-parser.ts` — os
 * adapters convertem internamente quando precisam, ver `gemini.ts` `toGeminiSchema`). */
const FINANCING_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    description: { type: "string", nullable: true },
    lender: { type: "string", nullable: true },
    operationRef: { type: "string", nullable: true },
    principal: { type: "string", nullable: true },
    downPayment: { type: "string", nullable: true },
    assetValue: { type: "string", nullable: true },
    assetDescription: { type: "string", nullable: true },
    installmentsCount: { type: "integer", nullable: true },
    installmentAmount: { type: "string", nullable: true },
    totalToPay: { type: "string", nullable: true },
    firstDueDate: { type: "string", nullable: true },
    interestRate: { type: "string", nullable: true },
    interestPeriod: { type: "string", enum: INTEREST_PERIOD_VALUES, nullable: true },
    cet: { type: "string", nullable: true },
    amortizationSystem: { type: "string", enum: AMORTIZATION_SYSTEM_VALUES, nullable: true },
    financedTaxes: { type: "string", nullable: true },
    financedInsurance: { type: "string", nullable: true },
    financedFees: { type: "string", nullable: true },
    installments: {
      type: "array",
      nullable: true,
      items: {
        type: "object",
        properties: { amount: { type: "string" }, dueDate: { type: "string" } },
        required: ["amount", "dueDate"],
      },
    },
  },
};

/**
 * Prompt pt-BR instruindo o Gemini a extrair os campos de um contrato/CCB de
 * financiamento — robusto a formatos de bancos diferentes (C6, Itaú, etc.),
 * já que o parser não depende de um layout fixo (diferente de regex/OCR
 * posicional).
 */
function buildFinancingPrompt(): string {
  return [
    "Você extrai dados estruturados de um DOCUMENTO de financiamento (pt-BR) de um usuário de um app de finanças pessoais. Pode ser: (a) um CONTRATO / CCB (Cédula de Crédito Bancário) de crédito de VEÍCULO (C6, Itaú, Santander, BV etc.); (b) um contrato de financiamento IMOBILIÁRIO / HABITACIONAL (Caixa/SFH, Itaú etc.); OU (c) um EXTRATO / DEMONSTRATIVO DE EVOLUÇÃO do financiamento (extrato de amortização, ex.: 'Demonstrativo de Evolução - Habitação' da Caixa). O layout e a TERMINOLOGIA mudam bastante entre esses tipos e bancos — os CAMPOS abaixo são universais; extraia o que houver, deixe null o que não houver.",
    "",
    "Conceitos importantes (não confunda estes campos entre si):",
    '- `principal` ("valor financiado"): o VALOR TOTAL FINANCIADO COM IMPOSTOS — o que as parcelas efetivamente amortizam. Em CCB costuma aparecer como "Valor Total Financiado (com impostos)" ou similar. NUNCA é o valor do bem (`assetValue`) nem a entrada (`downPayment`).',
    "- `downPayment`: entrada paga à vista pelo comprador (se houver).",
    "- `assetValue`: valor total do bem financiado (ex.: preço do veículo) — diferente do valor financiado.",
    '- `assetDescription`: descrição do bem financiado — veículo (ex.: "VW Polo Highline 2019") OU imóvel (ex.: "Apartamento, Vila Luciana, Goiânia-GO").',
    "",
    "Financiamento IMOBILIÁRIO / HABITACIONAL e EXTRATO DE EVOLUÇÃO (Caixa/SFH e similares) — mapeamento de termos:",
    '- "Prazo do Financiamento" (ex.: "360 meses") → `installmentsCount` (número TOTAL de parcelas). "Prazo Remanescente" é o que FALTA, NÃO o total — nunca use o remanescente como installmentsCount.',
    '- "Sistema de Amortização" → `amortizationSystem` (SAC / PRICE / SFH → normalize SFH-poupança/SAC decrescente como "SAC", prestação fixa como "PRICE").',
    '- Taxa: financiamento imobiliário/habitacional quase sempre informa a taxa ao ANO ("Taxa de Juros Contratual Nominal", ex.: "6,5%" = 6.5 a.a. → `interestRate="6.5"`, `interestPeriod="ANNUAL"`). CCB de veículo costuma ser ao MÊS. Use o contexto do documento (imóvel ~6-12% a.a.; veículo ~1-3% a.m.).',
    '- `installmentAmount`/`installments`: se o extrato trouxer a TABELA de prestações (ex.: valores ~R$ 1.119 decrescendo mês a mês), preencha `installments` com `{ amount, dueDate }` de cada linha e `amortizationSystem="SAC"`; se as prestações forem iguais, use `installmentAmount` + "PRICE".',
    '- ATENÇÃO — "Saldo Devedor" (Teórico / Atual / Residual) é o quanto AINDA FALTA pagar hoje, NÃO é o `principal` (valor financiado ORIGINAL). Num extrato de evolução geralmente NÃO há o valor financiado original, nem entrada, nem valor do bem. NUNCA INVENTE, ESTIME nem CALCULE `principal`/`downPayment`/`assetValue` a partir do saldo devedor, da parcela ou de qualquer outro número — se o valor não estiver EXPLÍCITO e rotulado no documento, retorne null. NUNCA use o saldo devedor como `principal`.',
    '- `operationRef`: o NÚMERO DO CONTRATO/operação, geralmente rotulado "Contrato" (ex.: "878771011401-3") — NÃO é o sistema de amortização, a agência, nem um código tipo "TP 0996". `lender`: o credor EXATO do documento em questão (ex.: "Caixa Econômica Federal" num doc da Caixa, "Banco C6 S.A." num CCB do C6) — NUNCA force um banco que não é o do documento.',
    "- REFORÇO: `principal` é o VALOR FINANCIADO ORIGINAL, rotulado explicitamente (ex.: \"Valor Total Financiado\"). Se o maior/único valor grande do documento for um SALDO DEVEDOR (extrato de evolução), `principal` é null — saldo devedor NUNCA vira principal.",
    '- `installmentAmount`: valor da parcela, só preencha se ela for FIXA (todas iguais) — nesse caso `amortizationSystem="PRICE"`.',
    '- Se o documento trouxer uma TABELA com o valor de CADA parcela (valores diferentes entre si — decrescentes ou variáveis), preencha `installments` com cada `{ amount, dueDate }` da tabela e `amortizationSystem="CUSTOM"` (ou "SAC" se for claramente Sistema de Amortização Constante decrescente) — nesse caso deixe `installmentAmount` null, não invente uma média.',
    "- `totalToPay`: soma de todas as parcelas (principal + juros total do contrato).",
    "- `firstDueDate`: data do primeiro vencimento.",
    '- `interestRate` + `interestPeriod`: taxa de juros do contrato. `interestPeriod` é APENAS o literal "MONTHLY" (taxa ao mês) ou "ANNUAL" (taxa ao ano) — NUNCA "a.a.", "a.m.", "anual" ou "%". Se o documento trouxer as duas, prefira a mensal.',
    '- `cet`: CET (Custo Efetivo Total) MENSAL do contrato, em % (ex.: "2.20").',
    "- `financedTaxes`: IOF financiado. `financedInsurance`: seguro financiado. `financedFees`: tarifas + registro financiados. Os três já estão DENTRO do `principal`/`totalToPay` — servem só pra detalhar a composição, nunca some de novo em cima do principal.",
    '- `lender`: nome do banco/credor (ex.: "Banco C6 S.A."). `operationRef`: número da operação/contrato.',
    "",
    "Regras de formatação:",
    '- Todo valor monetário: string decimal com PONTO como separador decimal, SEM separador de milhar e SEM símbolo de moeda (ex.: "51404.95" — nunca "51.404,95" nem "R$ 51.404,95"). Se o documento usa vírgula decimal e ponto de milhar (padrão BR), CONVERTA para ponto decimal antes de responder.',
    "- Toda data no formato ISO YYYY-MM-DD.",
    "- Campo que não aparece no documento, ou que você não consiga identificar com confiança: retorne null. NUNCA invente um valor.",
  ].join("\n");
}

/**
 * Valida a saída bruta do Gemini contra `parsedFinancingSchema` e mapeia pro
 * shape final `ParsedFinancing` — usado como `parseResponse` de `callGemini`.
 * `null` quando o shape não bate (nunca confiamos cegamente em saída de LLM).
 */
function parseFinancingResponse(rawJson: unknown): ParsedFinancing | null {
  const parsed = parsedFinancingSchema.safeParse(rawJson);
  if (!parsed.success) return null;

  return {
    description: parsed.data.description ?? null,
    lender: parsed.data.lender ?? null,
    operationRef: parsed.data.operationRef ?? null,
    principal: parsed.data.principal ?? null,
    downPayment: parsed.data.downPayment ?? null,
    assetValue: parsed.data.assetValue ?? null,
    assetDescription: parsed.data.assetDescription ?? null,
    installmentsCount: parsed.data.installmentsCount ?? null,
    installmentAmount: parsed.data.installmentAmount ?? null,
    totalToPay: parsed.data.totalToPay ?? null,
    firstDueDate: parsed.data.firstDueDate ?? null,
    interestRate: parsed.data.interestRate ?? null,
    interestPeriod: parsed.data.interestPeriod ?? null,
    cet: parsed.data.cet ?? null,
    amortizationSystem: parsed.data.amortizationSystem ?? null,
    financedTaxes: parsed.data.financedTaxes ?? null,
    financedInsurance: parsed.data.financedInsurance ?? null,
    financedFees: parsed.data.financedFees ?? null,
    installments: parsed.data.installments ?? null,
  };
}

/**
 * Extração via camada de IA (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Fluxo 2") — PDF com text layer usa `role: "document-text"` (deepseek, `thinking:false`),
 * o MESMO role usado pra fatura de cartão (`card-invoice-parser.ts`) — thinking/reasoning
 * OFF por padrão vale pra TODO documento, contrato incluso (decisão explícita do dono:
 * ligar reasoning só por medição concreta, nunca por suposição de que um documento
 * "parece complexo").
 * PDF escaneado (sem text layer) ou foto direta (mimeType não-PDF) usa
 * `role: "document-vision"` (qwen) — mesmo caminho de `card-invoice-parser.ts`.
 *
 * `password` só se aplica a PDF (CCB escaneado como foto não tem senha). Senha
 * errada/faltando (`PdfPasswordError`) e qualquer outra falha de leitura do PDF viram
 * `null` — MESMO contrato de sempre (`callGemini` também sempre devolvia `null` em
 * qualquer falha), o chamador (`modules/loans`, fora deste parser) já trata `null` como
 * "peça pro usuário preencher manualmente".
 */
export async function parseFinancingFromDocument(
  documentBytes: Buffer,
  mimeType: string,
  password?: string,
): Promise<ParsedFinancing | null> {
  // Extração de documento é lenta — 90s cobre o NVIDIA (deepseek-v4-flash) E o fallback
  // Gemini (que sem isso usaria o default curto de `callGemini` e abortava). < maxDuration.
  const DOCUMENT_TIMEOUT_MS = 90_000;
  const prompt = buildFinancingPrompt();

  if (mimeType !== "application/pdf") {
    return extractStructured(
      "document-vision",
      { kind: "vision", bytes: documentBytes, mimeType },
      prompt,
      FINANCING_RESPONSE_SCHEMA,
      parseFinancingResponse,
      { timeoutMs: DOCUMENT_TIMEOUT_MS },
    );
  }

  let extraction: { text: string; hasTextLayer: boolean };
  try {
    extraction = await extractPdfText(documentBytes, password);
  } catch (error) {
    if (error instanceof PdfPasswordError) return null;
    console.error("[modules/telegram/financing-parser] extractPdfText failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }

  if (extraction.hasTextLayer) {
    return extractStructured(
      "document-text",
      { kind: "text", text: extraction.text },
      prompt,
      FINANCING_RESPONSE_SCHEMA,
      parseFinancingResponse,
      { timeoutMs: DOCUMENT_TIMEOUT_MS },
    );
  }

  return extractStructured(
    "document-vision",
    { kind: "vision", bytes: documentBytes, mimeType },
    prompt,
    FINANCING_RESPONSE_SCHEMA,
    parseFinancingResponse,
    { timeoutMs: DOCUMENT_TIMEOUT_MS },
  );
}
