import { z } from "zod";
import { extractStructured } from "@/lib/ai/extract";
import type { JsonSchema } from "@/lib/ai/types";
import { calendarPartsSP } from "@/lib/date/calendar-sp";
import { formatBRL } from "@/lib/money/format";
import { reportService } from "@/modules/reports/service";
import { monthBoundsSP, subtractMonths } from "./score";
import type { MonthlyNarrative } from "./types";

/**
 * Narrativa mensal via IA (`monthlyNarrative`) — resume o mês em texto curto
 * ANCORADO nos números já calculados (fluxo de caixa + top categorias), nunca
 * deixando o modelo inventar valor. Base de CAIXA (`reportService.cashflow`,
 * `COALESCE(paidAt, date)`) consistentemente em toda a função — nunca mistura
 * com a base de competência (accrual) de `categoryTotals`/`expenseByCategory`
 * usada noutros relatórios (bug histórico documentado em
 * `modules/reports/service.ts`/`modules/telegram/query.ts`: misturar as duas
 * bases já produziu números que não batiam entre telas).
 */

const narrativeSchema = z.object({
  resumo: z.string().min(1),
  destaques: z.array(z.string()),
});

const NARRATIVE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    resumo: { type: "string" },
    destaques: { type: "array", items: { type: "string" } },
  },
  required: ["resumo", "destaques"],
};

function parseNarrative(raw: unknown): { resumo: string; destaques: string[] } | null {
  const result = narrativeSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Mês anterior ao (`year`,`month`) atual (calendário real, ver `calendarPartsSP`) — mês fechado/imutável, cache vale a pena; mês corrente muda a cada nova transação. */
function isClosedMonth(year: number, month: number): boolean {
  const now = calendarPartsSP(new Date());
  if (year !== now.year) return year < now.year;
  return month < now.month;
}

const MONTH_NAMES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function buildNumbersText(
  year: number,
  month: number,
  income: string,
  expense: string,
  net: string,
  prevIncome: string,
  prevExpense: string,
  topCategories: Array<{ name: string; total: string }>,
): string {
  const monthLabel = `${MONTH_NAMES_PT[month - 1]}/${year}`;
  const lines = [
    `Mês de referência: ${monthLabel}`,
    `Receita (caixa): ${income}`,
    `Despesa (caixa): ${expense}`,
    `Resultado líquido: ${net}`,
    `Receita do mês anterior: ${prevIncome}`,
    `Despesa do mês anterior: ${prevExpense}`,
    "Top categorias de gasto do mês:",
    ...topCategories.map((category) => `- ${category.name}: ${category.total}`),
  ];
  return lines.join("\n");
}

function buildNarrativePrompt(): string {
  return [
    "Você é um assistente financeiro pessoal (pt-BR). Escreva um resumo FACTUAL e curto do mês, usando SOMENTE os números fornecidos abaixo — NUNCA invente valor, categoria ou comparação que não esteja nos dados.",
    "",
    "`resumo`: 1-2 frases descrevendo receita, despesa e resultado do mês, comparando com o mês anterior quando relevante (ex.: \"despesa subiu X em relação ao mês passado\").",
    "`destaques`: lista de 2-4 frases curtas, cada uma sobre um fato pontual dos dados (ex.: maior categoria de gasto, se o mês fechou positivo ou negativo).",
    "",
    "Tom direto, sem conselho genérico de educação financeira, sem emoji, sem markdown.",
  ].join("\n");
}

async function buildNarrative(userId: string, year: number, month: number): Promise<MonthlyNarrative> {
  const { start: monthStart, end: monthEnd } = monthBoundsSP(year, month);
  const prev = subtractMonths(year, month, 1);
  const { start: prevStart, end: prevEnd } = monthBoundsSP(prev.year, prev.month);

  const [thisMonth, prevMonth, categories] = await Promise.all([
    reportService.cashflow(userId, monthStart, monthEnd),
    reportService.cashflow(userId, prevStart, prevEnd),
    reportService.categoryTotals(userId, monthStart, monthEnd),
  ]);

  const topCategories = categories
    .slice(0, 5)
    .map((category) => ({ name: category.categoryName, total: formatBRL(category.total.toNumber()) }));

  const numbersText = buildNumbersText(
    year,
    month,
    formatBRL(thisMonth.income.toNumber()),
    formatBRL(thisMonth.expense.toNumber()),
    formatBRL(thisMonth.net.toNumber()),
    formatBRL(prevMonth.income.toNumber()),
    formatBRL(prevMonth.expense.toNumber()),
    topCategories,
  );

  const raw = await extractStructured(
    "document-text",
    { kind: "text", text: numbersText },
    buildNarrativePrompt(),
    NARRATIVE_RESPONSE_SCHEMA,
    parseNarrative,
  );
  if (raw === null) return null;

  return { resumo: raw.resumo, destaques: raw.destaques, month, year };
}

/**
 * Cache em `Map` module-level pra mês FECHADO (imutável — mesma leitura vale
 * pra sempre) — sem `unstable_cache` do Next porque nenhum outro módulo do
 * projeto usa (grep vazio); mês corrente NUNCA cacheia (dado muda a cada
 * transação nova). Só cacheia resultado de SUCESSO: falha transitória da IA
 * (`null`) fica fora do cache, permitindo retry numa chamada futura.
 */
const narrativeCache = new Map<string, MonthlyNarrative>();

export async function monthlyNarrative(userId: string, year: number, month: number): Promise<MonthlyNarrative> {
  const closed = isClosedMonth(year, month);
  const cacheKey = `${userId}:${year}:${month}`;

  if (closed) {
    const cached = narrativeCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  const result = await buildNarrative(userId, year, month);

  if (closed && result !== null) narrativeCache.set(cacheKey, result);
  return result;
}
