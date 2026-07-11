import { z } from "zod";
import { extractStructured } from "@/lib/ai/extract";
import type { JsonSchema } from "@/lib/ai/types";
import { formatBRL } from "@/lib/money/format";
import { accountService } from "@/modules/accounts/service";
import { insightsService } from "@/modules/insights/service";
import { reportService } from "@/modules/reports/service";
import { resolvePeriodRange } from "./query";

/**
 * Pergunta financeira ABERTA via IA (`intent="ask"`, docs/30-TELEGRAM.md,
 * "Consulta por IA") — diferente de `query.ts` (que mapeia `queryType`s
 * fechados 1:1 pra um service, sem chamar IA), aqui a IA responde em texto
 * livre ANCORADA num contexto numérico compacto que montamos antes de
 * perguntar (mesmo racional de `insights/narrative.ts` `buildNarrative`:
 * nunca deixar o modelo inventar valor). Falha da IA (`null`) sempre cai num
 * fallback determinístico com os números-chave — o bot nunca fica sem
 * resposta (erro-como-dado, ~/.claude/rules/06-composition-errors.md).
 */

const TOP_CATEGORIES_LIMIT = 5;

const askResponseSchema = z.object({ answer: z.string().min(1) });

const ASK_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
};

function parseAskResponse(raw: unknown): { answer: string } | null {
  const result = askResponseSchema.safeParse(raw);
  return result.success ? result.data : null;
}

type CategoryAmount = { name: string; total: string };

type AskContext = {
  balance: string;
  thisMonthExpense: string;
  thisMonthIncome: string;
  lastMonthExpense: string;
  lastMonthIncome: string;
  thisMonthTopCategories: CategoryAmount[];
  lastMonthTopCategories: CategoryAmount[];
  healthScoreValue: number;
};

/**
 * Números-base pra ancorar a resposta: caixa (mesma base de
 * `reportService.cashflow`/`executeTelegramQuery`) deste mês vs. mês
 * passado, top categorias de ambos os períodos (accrual, `categoryTotals` —
 * mesma leitura de `/reports`), saldo atual e o score de saúde financeira do
 * módulo `insights`. Contexto pequeno de propósito — poucos números, não um
 * dump de transações.
 */
async function buildAskContext(userId: string): Promise<AskContext> {
  const thisMonth = resolvePeriodRange("this_month");
  const lastMonth = resolvePeriodRange("last_month");

  const [balance, thisMonthCashflow, lastMonthCashflow, thisMonthCategories, lastMonthCategories, health] =
    await Promise.all([
      accountService.totalBalance(userId),
      reportService.cashflow(userId, thisMonth.dateFrom, thisMonth.dateTo),
      reportService.cashflow(userId, lastMonth.dateFrom, lastMonth.dateTo),
      reportService.categoryTotals(userId, thisMonth.dateFrom, thisMonth.dateTo),
      reportService.categoryTotals(userId, lastMonth.dateFrom, lastMonth.dateTo),
      insightsService.healthScore(userId),
    ]);

  return {
    balance: balance.toString(),
    thisMonthExpense: thisMonthCashflow.expense.toString(),
    thisMonthIncome: thisMonthCashflow.income.toString(),
    lastMonthExpense: lastMonthCashflow.expense.toString(),
    lastMonthIncome: lastMonthCashflow.income.toString(),
    thisMonthTopCategories: thisMonthCategories
      .slice(0, TOP_CATEGORIES_LIMIT)
      .map((category) => ({ name: category.categoryName, total: category.total.toString() })),
    lastMonthTopCategories: lastMonthCategories
      .slice(0, TOP_CATEGORIES_LIMIT)
      .map((category) => ({ name: category.categoryName, total: category.total.toString() })),
    healthScoreValue: health.score,
  };
}

function categoryLines(label: string, categories: CategoryAmount[]): string[] {
  if (categories.length === 0) return [`${label}: (sem gasto no período)`];
  return [`${label}:`, ...categories.map((category) => `- ${category.name}: ${formatBRL(category.total)}`)];
}

function buildNumbersText(ctx: AskContext): string {
  const lines = [
    `Saldo atual em contas: ${formatBRL(ctx.balance)}`,
    `Despesa deste mês: ${formatBRL(ctx.thisMonthExpense)}`,
    `Receita deste mês: ${formatBRL(ctx.thisMonthIncome)}`,
    `Despesa do mês passado: ${formatBRL(ctx.lastMonthExpense)}`,
    `Receita do mês passado: ${formatBRL(ctx.lastMonthIncome)}`,
    `Score de saúde financeira (0-100, quanto maior melhor): ${ctx.healthScoreValue}`,
    ...categoryLines("Top categorias de gasto deste mês", ctx.thisMonthTopCategories),
    ...categoryLines("Top categorias de gasto do mês passado", ctx.lastMonthTopCategories),
  ];

  return lines.join("\n");
}

function buildAskPrompt(numbersText: string, question: string): string {
  return [
    "Você é um assistente financeiro pessoal (pt-BR) respondendo a uma pergunta livre de um usuário sobre as finanças dele, num bot do Telegram.",
    "Responda em 2 a 4 frases, direto ao ponto, ANCORADO ESTRITAMENTE nos números abaixo — NUNCA invente valor, categoria, período ou comparação que não esteja nos dados fornecidos.",
    "Se a pergunta exigir um dado que NÃO está na lista abaixo (ex.: histórico de anos anteriores, uma categoria não listada), diga honestamente que não tem essa informação, em vez de estimar ou supor.",
    "Sem markdown, sem emoji, sem saudação.",
    "",
    "Números disponíveis:",
    numbersText,
    "",
    `Pergunta do usuário: "${question}"`,
  ].join("\n");
}

/** Resposta determinística quando a IA falha (indisponível/timeout/shape inválido) — sempre dá os números-chave, nunca deixa o usuário sem nada. */
function buildFallbackAnswer(ctx: AskContext): string {
  const topCategory = ctx.thisMonthTopCategories[0];
  const categoryLine = topCategory ? ` Maior categoria: ${topCategory.name} (${formatBRL(topCategory.total)}).` : "";

  return [
    "Não consegui gerar uma resposta agora, mas aqui vão os números do mês:",
    `gasto de ${formatBRL(ctx.thisMonthExpense)} (mês passado: ${formatBRL(ctx.lastMonthExpense)}),`,
    `saldo atual ${formatBRL(ctx.balance)}.${categoryLine}`,
  ].join(" ");
}

export async function answerQuestion(userId: string, question: string): Promise<string> {
  const ctx = await buildAskContext(userId);
  const numbersText = buildNumbersText(ctx);

  const raw = await extractStructured(
    "document-text",
    { kind: "text", text: `${numbersText}\n\nPergunta: ${question}` },
    buildAskPrompt(numbersText, question),
    ASK_RESPONSE_SCHEMA,
    parseAskResponse,
  );

  return raw?.answer ?? buildFallbackAnswer(ctx);
}
