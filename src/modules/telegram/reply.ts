import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import type { TelegramTransactionType } from "./types";

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
    `✔ ${label}`,
    "",
    `${capitalize(params.description)} - ${formatBRL(params.amount)}`,
    `Categoria: ${params.categoryName}`,
    `Origem: ${params.originLabel}`,
    `Data: ${dateLabel}`,
  ].join("\n");
}

export function buildBalanceReply(totalBalance: string): string {
  return ["💰 Saldo atual", "", formatBRL(totalBalance)].join("\n");
}

/** Resumo mensal (docs/30-TELEGRAM.md, "Respostas do Bot" > "Resumo"). */
export function buildMonthExpensesReply(categories: Array<{ name: string; total: string }>, total: string): string {
  if (categories.length === 0) {
    return ["📊 Gastos do mês", "", "Nenhum gasto registrado ainda."].join("\n");
  }

  const lines = categories.map((category) => `${category.name}: ${formatBRL(category.total)}`);

  return ["📊 Gastos do mês", "", ...lines, "", `Total: ${formatBRL(total)}`].join("\n");
}

export function buildTodaySummaryReply(totalExpense: string): string {
  return ["📅 Resumo de hoje", "", `Gastos: ${formatBRL(totalExpense)}`].join("\n");
}

export function buildUnknownReply(): string {
  return [
    "🤔 Não entendi essa mensagem.",
    "",
    "Envie um valor pra registrar (ex.: mercado 120) ou um comando:",
    "saldo | gastos mes | hoje",
  ].join("\n");
}

export function buildErrorReply(message: string): string {
  return `⚠️ ${message}`;
}

/** Vínculo confirmado via `/vincular <CODE>` ou `/start <CODE>` (docs/12-SETTINGS.md, "3. Telegram"). */
export function buildTelegramLinkedReply(): string {
  return "✅ Telegram vinculado com sucesso! Agora você pode registrar transações por aqui.";
}

/** Mesma mensagem pras 3 reasons de falha (`invalid_command`, `invalid_or_expired_code`, `chat_already_linked`) — o usuário só precisa saber que precisa gerar um código novo. */
export function buildTelegramLinkFailedReply(): string {
  return "Código inválido ou expirado. Gere um novo em Configurações.";
}
