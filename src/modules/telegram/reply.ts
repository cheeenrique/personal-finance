import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo, formatDateShortSaoPaulo } from "@/lib/date/format";
import type { TelegramQueryPeriod, TelegramQueryResult, TelegramTransactionType } from "./types";

/**
 * Ícones padronizados de toda resposta do bot (docs/30-TELEGRAM.md, "Ícones
 * padronizados"): Telegram só suporta emoji (sem cor/bg custom), então TODA
 * resposta começa com um destes três — nunca outro emoji solto (💰/📊/📅/🤔/✔
 * legados foram substituídos por eles).
 */
const ICON_SUCCESS = "✅";
const ICON_ERROR = "❌";
const ICON_WARNING = "⚠️";

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Confirmação de transação (docs/30-TELEGRAM.md, "Respostas do Bot"). `date`
 * é a data JÁ PERSISTIDA (`transaction.date`, sempre um `Date` real resolvido
 * pelo schema) — nunca reformatar a partir de uma string `YYYY-MM-DD` crua
 * aqui (mesma pegadinha de timezone documentada em `lib/date/schema.ts`).
 * `isPaid=false` marca "(previsto)" — lançamento com data futura
 * (docs/30-TELEGRAM.md, "Parsing por IA").
 */
export function buildTransactionConfirmationReply(params: {
  type: TelegramTransactionType;
  description: string;
  amount: string;
  categoryName: string;
  originLabel: string;
  date: Date;
  isPaid: boolean;
}): string {
  const label = params.type === "INCOME" ? "Receita registrada" : "Gasto registrado";
  const dateLabel = formatDateSaoPaulo(params.date) + (params.isPaid ? "" : " (previsto)");

  return [
    `${ICON_SUCCESS} ${label}`,
    "",
    `${capitalize(params.description)} - ${formatBRL(params.amount)}`,
    `Categoria: ${params.categoryName}`,
    `Origem: ${params.originLabel}`,
    `Data: ${dateLabel}`,
  ].join("\n");
}

export function buildBalanceReply(totalBalance: string): string {
  return [`${ICON_SUCCESS} Saldo atual`, "", formatBRL(totalBalance)].join("\n");
}

/** Resumo mensal (docs/30-TELEGRAM.md, "Respostas do Bot" > "Resumo"). */
export function buildMonthExpensesReply(categories: Array<{ name: string; total: string }>, total: string): string {
  if (categories.length === 0) {
    return [`${ICON_SUCCESS} Gastos do mês`, "", "Nenhum gasto registrado ainda."].join("\n");
  }

  const lines = categories.map((category) => `${category.name}: ${formatBRL(category.total)}`);

  return [`${ICON_SUCCESS} Gastos do mês`, "", ...lines, "", `Total: ${formatBRL(total)}`].join("\n");
}

export function buildTodaySummaryReply(totalExpense: string): string {
  return [`${ICON_SUCCESS} Resumo de hoje`, "", `Gastos: ${formatBRL(totalExpense)}`].join("\n");
}

export function buildUnknownReply(): string {
  return [
    `${ICON_WARNING} Não entendi essa mensagem.`,
    "",
    "Envie um valor pra registrar (ex.: mercado 120) ou um comando:",
    "saldo | gastos mes | hoje",
  ].join("\n");
}

export function buildErrorReply(message: string): string {
  return `${ICON_ERROR} ${message}`;
}

/**
 * Pergunta de valor faltante (docs/30-TELEGRAM.md, "Fluxo conversacional") —
 * disparada quando o draft não tem um `amount` válido. A resposta do usuário
 * é mesclada por `pending-merge.ts`.
 */
export function buildAskAmountReply(): string {
  return `${ICON_WARNING} Quanto foi?`;
}

/**
 * Pergunta de origem faltante/irresolvível (docs/30-TELEGRAM.md, "Fluxo
 * conversacional") — disparada quando não há conta/cartão real do usuário
 * batendo com o `paymentMethod`/nome citado (ou nenhum foi citado).
 */
export function buildAskOriginReply(): string {
  return [
    `${ICON_WARNING} De onde saiu?`,
    "Responda com o cartão ou conta (ex.: crédito Nubank, pix Carteira).",
  ].join("\n");
}

/**
 * Origem ambígua (docs/30-TELEGRAM.md, bug fix "origem faz loop"): o núcleo
 * citado bateu em MAIS de uma conta/cartão real (ex.: "Nubank" batendo em
 * "Nubank - Pessoal" E "Nubank - MEI") — lista os candidatos em vez do
 * genérico `buildAskOriginReply`. A próxima resposta do usuário (ex.: "MEI")
 * é re-mesclada no draft e re-resolvida (`resolveOriginStrict`) — o match por
 * contém tende a achar só 1 candidato dessa vez.
 */
export function buildAskOriginAmbiguousReply(candidateLabels: string[]): string {
  return [`${ICON_WARNING} Encontrei mais de uma opção. Qual delas?`, ...candidateLabels].join("\n");
}

/** "cancelar" com um pending em aberto (docs/30-TELEGRAM.md, "Fluxo conversacional"). */
export function buildPendingCancelledReply(): string {
  return `${ICON_SUCCESS} Lançamento cancelado.`;
}

/** ~3 rodadas de pergunta sem resolver o campo faltante — desiste em vez de perguntar pra sempre (docs/30-TELEGRAM.md, "Fluxo conversacional"). */
export function buildPendingGaveUpReply(): string {
  return [
    `${ICON_WARNING} Não consegui completar esse lançamento.`,
    "Envie a mensagem completa de novo (ex.: mercado 50 pix nubank).",
  ].join("\n");
}

/**
 * Foto que não deu pra baixar OU que o Gemini não conseguiu ler como um
 * lançamento (sem valor legível, ou nada de financeiro reconhecível na
 * imagem — docs/30-TELEGRAM.md, bot aceita foto de nota/comprovante/
 * notificação). Mesmo padrão de "não entendi" (`buildUnknownReply`): ⚠️, pede
 * pra tentar de novo ou digitar em texto.
 */
export function buildImageUnreadableReply(): string {
  return [
    `${ICON_WARNING} Não consegui identificar um lançamento nessa foto.`,
    "Manda de novo com mais luz/foco, ou digite o lançamento em texto (ex.: mercado 120).",
  ].join("\n");
}

/** Rótulo pt-BR de um período de consulta (docs/30-TELEGRAM.md, "Consulta por IA") — usado nos títulos de `buildQueryReply`. */
function periodLabel(period: TelegramQueryPeriod): string {
  switch (period) {
    case "this_month":
      return "esse mês";
    case "last_month":
      return "mês passado";
    case "this_year":
      return "esse ano";
  }
}

/**
 * Formata o resultado tipado de uma consulta em linguagem natural
 * (docs/30-TELEGRAM.md, "Consulta por IA", `query.ts` `executeTelegramQuery`).
 * Reusa `buildBalanceReply`/`buildAskOriginAmbiguousReply` já existentes pros
 * casos que coincidem (saldo / origem ambígua) em vez de duplicar o texto.
 */
export function buildQueryReply(result: TelegramQueryResult): string {
  switch (result.kind) {
    case "spent":
      return [`${ICON_SUCCESS} Gastos ${periodLabel(result.period)}`, "", formatBRL(result.total)].join("\n");

    case "received":
      return [`${ICON_SUCCESS} Receitas ${periodLabel(result.period)}`, "", formatBRL(result.total)].join("\n");

    case "unpaid":
      return [`${ICON_SUCCESS} A pagar ${periodLabel(result.period)}`, "", formatBRL(result.total)].join("\n");

    case "balance":
      return buildBalanceReply(result.total);

    case "category_total":
      return [
        `${ICON_SUCCESS} ${result.categoryName} ${periodLabel(result.period)}`,
        "",
        formatBRL(result.total),
      ].join("\n");

    case "category_not_found":
      return `${ICON_WARNING} Não encontrei a categoria "${result.categoryName}".`;

    case "top_categories": {
      if (result.categories.length === 0) {
        return [
          `${ICON_SUCCESS} Maiores gastos ${periodLabel(result.period)}`,
          "",
          "Nenhum gasto registrado no período.",
        ].join("\n");
      }

      const lines = result.categories.map((category, index) => `${index + 1}. ${category.name}: ${formatBRL(category.total)}`);
      return [`${ICON_SUCCESS} Maiores gastos ${periodLabel(result.period)}`, "", ...lines].join("\n");
    }

    case "card_invoice":
      return `${ICON_SUCCESS} Fatura ${result.cardName}: ${formatBRL(result.total)} (vence ${formatDateShortSaoPaulo(result.dueDate)}).`;

    case "card_not_found":
      return `${ICON_WARNING} Não encontrei o cartão "${result.cardName}".`;

    case "card_no_invoice":
      return `${ICON_WARNING} O cartão "${result.cardName}" não tem fatura (não é cartão de crédito).`;

    case "card_ambiguous":
      return buildAskOriginAmbiguousReply(result.candidates);
  }
}

/** Vínculo confirmado via `/vincular <CODE>` ou `/start <CODE>` (docs/12-SETTINGS.md, "3. Telegram"). */
export function buildTelegramLinkedReply(): string {
  return `${ICON_SUCCESS} Telegram vinculado com sucesso! Agora você pode registrar transações por aqui.`;
}

/** Mesma mensagem pras 3 reasons de falha (`invalid_command`, `invalid_or_expired_code`, `chat_already_linked`) — o usuário só precisa saber que precisa gerar um código novo. */
export function buildTelegramLinkFailedReply(): string {
  return `${ICON_ERROR} Código inválido ou expirado. Gere um novo em Configurações.`;
}
