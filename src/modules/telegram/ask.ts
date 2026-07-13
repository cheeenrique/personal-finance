import { z } from "zod";
import { callGemini } from "@/lib/ai/gemini";
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
 *
 * Chama `callGemini` (`@/lib/ai/gemini.ts`) DIRETO — mesma infra rápida que
 * `ai-parser.ts` já usa pro parser de texto/voz — em vez de
 * `extractStructured` (`@/lib/ai/extract.ts`, cadeia NVIDIA 60s + retry 60s +
 * fallback Gemini 8s, pior caso ~128s). Timeout de `ASK_TIMEOUT_MS` (~10s,
 * bem abaixo do `maxDuration=30` do webhook) e SEM retry — pior caso vira só
 * ~10s + latência de rede, nunca mais mata a function por timeout de infra.
 */

const TOP_CATEGORIES_LIMIT = 5;
const ASK_TIMEOUT_MS = 10_000;

const askResponseSchema = z.object({ answer: z.string().min(1) });

/** Formato Gemini (UPPERCASE, `type: "OBJECT"`) — schema trivial de 1 campo, sem indireção via `toGeminiSchema` (YAGNI, regra 02-dry-kiss-yagni). */
const ASK_GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: { answer: { type: "STRING" } },
  required: ["answer"],
} as const;

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

/**
 * Fonte única de verdade do que o bot faz/não faz (docs/30-TELEGRAM.md) —
 * texto literal interpolado no prompt, NÃO uma lista dinâmica de
 * features/flags (regra 02-dry-kiss-yagni: sem indireção pra um texto que só
 * este prompt consome). Mantida sincronizada manualmente com as capacidades
 * reais do bot (`handlers.ts`) sempre que uma nova intent for adicionada.
 */
const BOT_CAPABILITIES_BLOCK = [
  "O bot FAZ:",
  '- lançar gasto ou receita (ex.: "mercado 120", "recebi 500 de freela")',
  "- consultar saldo, gastos do mês, resumo de hoje, top categorias, fatura de cartão",
  '- registrar aporte em investimento (ex.: "investi 100 no Cofrinho Nubank")',
  "- ler foto de recibo/comprovante/notificação e PDF de contrato de financiamento",
  '- criar categoria nova (ex.: "cria categoria academia", "cria categoria pedágio dentro de transporte")',
  "",
  "O bot NÃO FAZ (oriente a fazer no app):",
  "- editar ou apagar conta, cartão ou transação já lançada",
  "- editar categoria existente (renomear, mudar ícone/cor, mover de pai)",
  "- gerar relatórios/gráficos (isso é o Dashboard/relatórios do app)",
].join("\n");

/**
 * Prompt do "assistente do bot" — UMA única chamada classifica e responde os
 * 4 comportamentos abaixo (mesmo padrão de `ai-parser.ts`, que já classifica
 * `intent` numa única chamada); sem 2ª chamada de "classificar antes de
 * responder" (custo/latência não compensam pra pergunta livre de baixo
 * volume, docs/30-TELEGRAM.md).
 *
 * 1. Pergunta financeira → responde ancorada nos números abaixo, nunca
 *    inventa valor/categoria/período fora da lista.
 * 2. Pergunta de capacidade ("o que você faz?") → lista o que o bot faz
 *    (`BOT_CAPABILITIES_BLOCK`).
 * 3. Pedido fora de escopo (editar/apagar conta/cartão/transação já
 *    lançada) → recusa curta + orienta a fazer no app.
 * 4. Ambíguo → pede a informação que falta em 1 frase, sem inventar.
 */
function buildAskPrompt(numbersText: string, question: string): string {
  return [
    "Você é o assistente de um bot do Telegram de finanças pessoais (pt-BR), respondendo a uma mensagem livre de um usuário.",
    "Classifique a mensagem em UM destes 4 casos e responda de acordo, em 1 a 4 frases, direto ao ponto, sem markdown, sem emoji, sem saudação:",
    "",
    "1) PERGUNTA FINANCEIRA (sobre os números das finanças dele) — responda ANCORADO ESTRITAMENTE nos números abaixo. NUNCA invente valor, categoria, período ou comparação que não esteja nos dados fornecidos. Se a pergunta exigir um dado que NÃO está na lista (ex.: histórico de anos anteriores, uma categoria não listada), diga honestamente que não tem essa informação, em vez de estimar ou supor.",
    '2) PERGUNTA DE CAPACIDADE (ex.: "o que você faz?", "o que você sabe fazer?") — liste o que o bot faz, com base EXATA no bloco de capacidades abaixo.',
    "3) PEDIDO FORA DE ESCOPO (ex.: editar ou apagar uma conta/cartão/transação já lançada, mudar categoria de uma transação já lançada) — recuse em 1 frase e oriente a fazer isso no app.",
    "4) AMBÍGUO (falta informação pra entender o que o usuário quer) — peça, em 1 frase, a informação que falta, sem inventar nada.",
    "",
    "Bloco de capacidades do bot:",
    BOT_CAPABILITIES_BLOCK,
    "",
    "Números disponíveis (só use pra responder o caso 1):",
    numbersText,
    "",
    `Mensagem do usuário: "${question}"`,
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

  const raw = await callGemini(
    [{ parts: [{ text: buildAskPrompt(numbersText, question) }] }],
    "ask",
    ASK_GEMINI_RESPONSE_SCHEMA,
    parseAskResponse,
    ASK_TIMEOUT_MS,
  );

  return raw?.answer ?? buildFallbackAnswer(ctx);
}
