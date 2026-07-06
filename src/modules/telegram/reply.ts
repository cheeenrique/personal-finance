import { formatBRL } from "@/lib/money/format";
import type { TelegramTransactionType } from "./types";

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Confirmação de transação (docs/30-TELEGRAM.md, "Respostas do Bot"). */
export function buildTransactionConfirmationReply(params: {
  type: TelegramTransactionType;
  description: string;
  amount: string;
  categoryName: string;
}): string {
  const label = params.type === "INCOME" ? "Receita registrada" : "Gasto registrado";

  return [
    `✔ ${label}`,
    "",
    `${capitalize(params.description)} - ${formatBRL(params.amount)}`,
    `Categoria: ${params.categoryName}`,
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
