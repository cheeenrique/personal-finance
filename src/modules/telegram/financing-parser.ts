import { z } from "zod";
import type { ParsedFinancing } from "./types";
import { callGemini, type GeminiContentPart } from "./ai-parser";

/**
 * Parsing de um DOCUMENTO de financiamento (CCB/contrato de banco, PDF ou
 * foto) via Gemini Flash (docs/50-AUDITORIA-BACKLOG.md — módulo `loans`,
 * `kind=FINANCING`). Reusa `callGemini` (`ai-parser.ts`) — mesmo padrão
 * REST/timeout/tratamento de erro da extração de transação, só o
 * `contents`/schema/validador mudam. Gemini 2.5 Flash aceita PDF via
 * `inlineData` com `mimeType: "application/pdf"`, igual imagem — mesmo
 * caminho serve pra foto do contrato.
 *
 * Decisão do dono do produto: Gemini é mais assertivo que regex/OCR pra ler
 * CCB de bancos diferentes (layout varia bastante entre C6, Itaú etc.).
 *
 * NUNCA loga o conteúdo do documento nem a API key (docs/30-TELEGRAM.md,
 * "Segurança") — mesmo racional de `ai-parser.ts`.
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

/** Formato Gemini/OpenAPI do `responseSchema` — espelha `parsedFinancingSchema` acima (structured output, ver `RESPONSE_SCHEMA` em `ai-parser.ts` pro mesmo padrão). */
const FINANCING_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    description: { type: "STRING", nullable: true },
    lender: { type: "STRING", nullable: true },
    operationRef: { type: "STRING", nullable: true },
    principal: { type: "STRING", nullable: true },
    downPayment: { type: "STRING", nullable: true },
    assetValue: { type: "STRING", nullable: true },
    assetDescription: { type: "STRING", nullable: true },
    installmentsCount: { type: "INTEGER", nullable: true },
    installmentAmount: { type: "STRING", nullable: true },
    totalToPay: { type: "STRING", nullable: true },
    firstDueDate: { type: "STRING", nullable: true },
    interestRate: { type: "STRING", nullable: true },
    interestPeriod: { type: "STRING", enum: INTEREST_PERIOD_VALUES, nullable: true },
    cet: { type: "STRING", nullable: true },
    amortizationSystem: { type: "STRING", enum: AMORTIZATION_SYSTEM_VALUES, nullable: true },
    financedTaxes: { type: "STRING", nullable: true },
    financedInsurance: { type: "STRING", nullable: true },
    financedFees: { type: "STRING", nullable: true },
    installments: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          amount: { type: "STRING" },
          dueDate: { type: "STRING" },
        },
        required: ["amount", "dueDate"],
      },
    },
  },
} as const;

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
 * Extração via Gemini a partir de um DOCUMENTO de financiamento — PDF ou foto
 * do contrato/CCB, `mimeType` tipicamente `"application/pdf"` ou
 * `"image/jpeg"`/`"image/png"`. `null` em qualquer falha (sem
 * `GEMINI_API_KEY`, erro de rede, timeout, resposta não-2xx, JSON inválido ou
 * fora do shape esperado) — NUNCA lança; o chamador (módulo `loans`, fora do
 * escopo deste parser) decide o fallback (ex.: pedir pra digitar os campos
 * manualmente). NUNCA loga os bytes do documento nem a API key.
 */
export async function parseFinancingFromDocument(
  documentBytes: Buffer,
  mimeType: string,
): Promise<ParsedFinancing | null> {
  const parts: GeminiContentPart[] = [
    { inlineData: { mimeType, data: documentBytes.toString("base64") } },
    { text: buildFinancingPrompt() },
  ];

  return callGemini([{ parts }], "financing-document", FINANCING_RESPONSE_SCHEMA, parseFinancingResponse);
}
