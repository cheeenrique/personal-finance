import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo, formatDateShortSaoPaulo } from "@/lib/date/format";
import { parseFlexibleDate } from "@/lib/date/schema";
import type { ParsedFinancing, ParsedInterestPeriod, TelegramQueryPeriod, TelegramQueryResult, TelegramTransactionType } from "./types";

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
 * lançamento (sem valor legível, ou nada de financeiro reconhecível —
 * docs/30-TELEGRAM.md). Mensagem honesta: não culpa "luz/foco" (prints
 * digitais nítidos também falham). Pede reenvio ou texto.
 */
export function buildImageUnreadableReply(): string {
  return [
    `${ICON_WARNING} Não consegui ler valor/estabelecimento nessa imagem.`,
    "Manda de novo (print inteiro da compra) ou digite o lançamento em texto (ex.: mercado 120).",
  ].join("\n");
}

/**
 * Nota de voz inaudível / Gemini falhou / pending aberto (docs/30-TELEGRAM.md
 * — parsing por voz). Pede pra digitar; não culpa o microfone genérico.
 */
export function buildVoiceUnreadableReply(): string {
  return [
    `${ICON_WARNING} Não consegui entender essa nota de voz.`,
    "Manda de novo com mais clareza, ou digite o lançamento (ex.: mercado 120).",
  ].join("\n");
}

/**
 * Vídeo circular (`video_note`) ou vídeo comum — o bot não processa vídeo
 * (docs/30-TELEGRAM.md). Antes ficava mudo (200 sem reply); agora explica.
 */
export function buildVideoRejectedReply(): string {
  return [
    `${ICON_WARNING} Não aceito vídeo.`,
    "Manda uma nota de voz (ícone do microfone) ou digite o lançamento (ex.: mercado 120).",
  ].join("\n");
}

/**
 * Update com mídia/arquivo que o bot não roteia (sticker, etc.) — evita
 * webhook 200 mudo (docs/30-TELEGRAM.md).
 */
export function buildUnsupportedMessageReply(): string {
  return [
    `${ICON_WARNING} Não entendi esse tipo de mensagem.`,
    "Manda texto, foto, nota de voz ou PDF do contrato.",
  ].join("\n");
}

/** Soft-delete via botão Desfazer (callback_query) — confirma e remove o teclado. */
export function buildTransactionUndoneReply(): string {
  return `${ICON_SUCCESS} Lançamento desfeito.`;
}

export function buildInvestmentNeedAmountReply(): string {
  return `${ICON_WARNING} Quanto você quer investir? Ex.: "investi 100 no Cofrinho Nubank".`;
}

export function buildInvestmentNeedNameReply(): string {
  return `${ICON_WARNING} Em qual investimento? Ex.: "investi 100 no Cofrinho Nubank".`;
}

export function buildInvestmentNotFoundReply(name: string): string {
  return `${ICON_WARNING} Não encontrei o investimento "${name}". Cadastre-o em Investimentos no app.`;
}

export function buildInsufficientBalanceReply(
  accountName: string,
  balance: string,
  amount: string,
): string {
  return [
    `${ICON_ERROR} Saldo insuficiente na conta ${accountName}.`,
    `Disponível: ${formatBRL(balance)} · Tentativa: ${formatBRL(amount)}.`,
  ].join("\n");
}

export function buildInvestmentContributionReply(params: {
  investmentName: string;
  amount: string;
  accountName: string;
  position: string;
}): string {
  return [
    `${ICON_SUCCESS} Aporte registrado`,
    "",
    `${formatBRL(params.amount)} → ${params.investmentName}`,
    `Conta: ${params.accountName}`,
    `Posição atual: ${formatBRL(params.position)}`,
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

    case "investments": {
      if (result.items.length === 0) {
        return [
          `${ICON_SUCCESS} Investimentos`,
          "",
          "Nenhum investimento cadastrado.",
        ].join("\n");
      }

      const lines = result.items.map((item, index) => {
        const yieldLabel = item.yieldPercentOfBenchmark
          ? ` · ${Number(item.yieldPercentOfBenchmark).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% CDI`
          : "";
        return `${index + 1}. ${item.name}: ${formatBRL(item.currentValue)}${yieldLabel}`;
      });

      return [
        `${ICON_SUCCESS} Investimentos (${result.items.length})`,
        "",
        ...lines,
        "",
        `Total: ${formatBRL(result.total)}`,
      ].join("\n");
    }
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

/** `"1.79"` (decimal com ponto, formato de saída do parser) → `"1,79"` (leitura pt-BR) — só troca o separador, mesma lógica de "não é cálculo, é apresentação" de `lib/money/format.ts`. */
function formatPercentBR(value: string): string {
  return value.replace(".", ",");
}

function interestPeriodLabel(period: ParsedInterestPeriod): string {
  return period === "MONTHLY" ? "a.m." : "a.a.";
}

/** `installmentsCount`/`installmentAmount` podem vir isolados (documento com tabela de parcelas variáveis, ver `financing-parser.ts`) — cobre os 3 casos (ambos, só count, só amount) antes de omitir a linha. */
function financingInstallmentsLine(parsed: ParsedFinancing): string | null {
  if (parsed.installmentsCount && parsed.installmentAmount) {
    return `${parsed.installmentsCount} parcelas de ${formatBRL(parsed.installmentAmount)}`;
  }
  if (parsed.installmentsCount) return `${parsed.installmentsCount} parcelas`;
  if (parsed.installmentAmount) return `Parcela: ${formatBRL(parsed.installmentAmount)}`;
  return null;
}

function financingInterestLine(parsed: ParsedFinancing): string | null {
  if (!parsed.interestRate) return null;
  const period = parsed.interestPeriod ? interestPeriodLabel(parsed.interestPeriod) : interestPeriodLabel("MONTHLY");
  return `Juros: ${formatPercentBR(parsed.interestRate)}% ${period}`;
}

/**
 * `firstDueDate` vem `YYYY-MM-DD` (sem hora) do parser — `parseFlexibleDate`
 * (mesmo helper canônico de `lib/date/schema.ts` usado em todo o app) trata
 * isso como meia-noite em America/Sao_Paulo antes de formatar, evitando a
 * mesma pegadinha de timezone documentada em `buildTransactionConfirmationReply`.
 */
function financingFirstDueDateLine(parsed: ParsedFinancing): string | null {
  if (!parsed.firstDueDate) return null;
  return `1ª parcela: ${formatDateSaoPaulo(parseFlexibleDate(parsed.firstDueDate))}`;
}

/**
 * Resumo do que o Gemini extraiu de um DOCUMENTO de financiamento
 * (docs/30-TELEGRAM.md — ingestão por documento, `financing-parser.ts`).
 * Campo nulo simplesmente não vira linha (o Gemini já é instruído a nunca
 * inventar valor, `buildFinancingPrompt`). NÃO cria o `Loan` — só informa o
 * usuário do que foi lido; o cadastro (conta/asset/link de parcelas) acontece
 * no app. Usa `ICON_SUCCESS` (nunca um emoji solto novo) — mesma regra de
 * "ícones padronizados" de todo o resto deste arquivo.
 *
 * `null` quando o Gemini validou o shape mas não achou NENHUM campo
 * reconhecível (documento sem informação útil) — o caller (`handlers.ts`)
 * trata isso como falha de leitura, mesma resposta de parser retornando
 * `null` (`buildDocumentUnreadableReply`), nunca um resumo vazio.
 */
export function buildFinancingSummaryReply(parsed: ParsedFinancing): string | null {
  const lines = [
    parsed.lender ? `Credor: ${parsed.lender}` : null,
    parsed.principal ? `Valor financiado: ${formatBRL(parsed.principal)}` : null,
    parsed.assetValue ? `Valor do bem: ${formatBRL(parsed.assetValue)}` : null,
    parsed.downPayment ? `Entrada: ${formatBRL(parsed.downPayment)}` : null,
    financingInstallmentsLine(parsed),
    parsed.totalToPay ? `Total a pagar: ${formatBRL(parsed.totalToPay)}` : null,
    financingFirstDueDateLine(parsed),
    financingInterestLine(parsed),
    parsed.cet ? `CET: ${formatPercentBR(parsed.cet)}% a.m.` : null,
    parsed.assetDescription ? `Bem: ${parsed.assetDescription}` : null,
  ].filter((line): line is string => line !== null);

  if (lines.length === 0) return null;

  return [
    `${ICON_SUCCESS} Financiamento identificado:`,
    "",
    ...lines.map((line) => `• ${line}`),
    "",
    "Abra o app em Financiamentos pra revisar e cadastrar.",
  ].join("\n");
}

/** Parser retornou `null` (docs/30-TELEGRAM.md — Gemini indisponível, timeout, ou documento sem shape reconhecível) — pede o original ou uma foto mais nítida, mesmo tom de `buildImageUnreadableReply`. */
export function buildDocumentUnreadableReply(): string {
  return [
    `${ICON_WARNING} Não consegui ler o documento.`,
    "Tenta o PDF original ou uma foto mais nítida.",
  ].join("\n");
}

/** `message.document` com mimeType fora de PDF/imagem (docs/30-TELEGRAM.md — ingestão por documento só aceita PDF/foto do contrato). */
export function buildDocumentUnsupportedReply(): string {
  return [
    `${ICON_WARNING} Não consigo ler esse tipo de arquivo.`,
    "Envie o contrato em PDF ou como foto.",
  ].join("\n");
}
