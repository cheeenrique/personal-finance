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
    "Você extrai dados estruturados de um DOCUMENTO de financiamento (contrato, CCB — Cédula de Crédito Bancário — ou similar) de um usuário de um app de finanças pessoais (pt-BR). O documento pode ser um PDF ou uma foto/print do contrato, de bancos diferentes (C6, Itaú, Santander, Bradesco etc.) — o layout muda, os CAMPOS abaixo são universais em contratos de crédito financiado.",
    "",
    "Conceitos importantes (não confunda estes campos entre si):",
    '- `principal` ("valor financiado"): o VALOR TOTAL FINANCIADO COM IMPOSTOS — o que as parcelas efetivamente amortizam. Em CCB costuma aparecer como "Valor Total Financiado (com impostos)" ou similar. NUNCA é o valor do bem (`assetValue`) nem a entrada (`downPayment`).',
    "- `downPayment`: entrada paga à vista pelo comprador (se houver).",
    "- `assetValue`: valor total do bem financiado (ex.: preço do veículo) — diferente do valor financiado.",
    '- `assetDescription`: descrição do bem (ex.: "VW Polo Highline 2019").',
    '- `installmentAmount`: valor da parcela, só preencha se ela for FIXA (todas iguais) — nesse caso `amortizationSystem="PRICE"`.',
    '- Se o documento trouxer uma TABELA com o valor de CADA parcela (valores diferentes entre si — decrescentes ou variáveis), preencha `installments` com cada `{ amount, dueDate }` da tabela e `amortizationSystem="CUSTOM"` (ou "SAC" se for claramente Sistema de Amortização Constante decrescente) — nesse caso deixe `installmentAmount` null, não invente uma média.',
    "- `totalToPay`: soma de todas as parcelas (principal + juros total do contrato).",
    "- `firstDueDate`: data do primeiro vencimento.",
    '- `interestRate` + `interestPeriod`: taxa de juros do contrato — "MONTHLY" se a taxa informada for ao mês, "ANNUAL" se for ao ano. Se o documento trouxer as duas, prefira preencher a mensal.',
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
 * "parece complexo" — ver nota condicional no final do arquivo/plano, T13, sobre trocar
 * pra `role: "document-text-reasoning"` SE os testes reais mostrarem confusão de campo).
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
  );
}
