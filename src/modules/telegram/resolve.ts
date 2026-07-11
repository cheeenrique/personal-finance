import { CategoryType } from "@/generated/prisma/enums";
import { categoryService } from "@/modules/categories/service";
import { accountService } from "@/modules/accounts/service";
import { cardService } from "@/modules/cards/service";
import { investmentService } from "@/modules/investments/service";
import { transactionService } from "@/modules/transactions/service";
import type { Category, CategoryTreeNode } from "@/modules/categories/types";
import type { KnownMerchant } from "@/modules/transactions/types";
import { normalizeWord } from "./normalize";
import { FallbackCategoryMissingError, NoActiveAccountError } from "./errors";
import type {
  OriginMatchResult,
  TelegramOrigin,
  TelegramOriginKind,
  TelegramPaymentMethod,
  TelegramTransactionType,
} from "./types";

/**
 * Fallback fixo por tipo (docs/24-CATEGORIES.md + docs/30-TELEGRAM.md, Regra
 * 2). "Outros" (EXPENSE) é o MESMO nome hardcoded usado pelo parser oficial
 * do produto (ver `modules/categories/service.ts`, `SYSTEM_FALLBACK_NAME`) —
 * nunca renomear/apagar essa categoria sem atualizar aqui também. "Outros
 * (Receita)" é o equivalente para INCOME (mesmo raciocínio: transação nunca
 * fica sem categoria).
 */
const FALLBACK_CATEGORY_NAME: Record<TelegramTransactionType, string> = {
  EXPENSE: "Outros",
  INCOME: "Outros (Receita)",
};

function flattenTree(nodes: CategoryTreeNode[]): Category[] {
  const flat: Category[] = [];
  for (const node of nodes) {
    flat.push(node);
    flat.push(...flattenTree(node.children));
  }
  return flat;
}

/** Nome da categoria em "partes" normalizadas (ex.: "Uber/99/Táxi" → ["uber", "99", "taxi"]) — permite bater uma palavra isolada com um nome composto. */
function categoryNameParts(name: string): string[] {
  return name
    .split(/[\s/]+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function matchByKeyword(candidates: string[], categories: Category[]): Category | null {
  for (const candidate of candidates) {
    const normalized = normalizeWord(candidate);
    if (!normalized) continue;

    const match = categories.find((category) => categoryNameParts(category.name).includes(normalized));
    if (match) return match;
  }

  return null;
}

/**
 * Resolve a categoria de uma transação criada via Telegram (docs/30-TELEGRAM.md,
 * Regra 2 + "Estrutura de Interpretação"): 1) palavra-chave explícita ou a
 * própria descrição batendo com nome de categoria (própria OU filha) já
 * existente do usuário — usa a categoria EXATA que casou, sem subir pro pai
 * (granularidade específica pros relatórios); 2) HISTÓRICO — categoria da
 * transação mais recente com essa MESMA descrição (`transactionService.
 * lastCategoryForDescription`, reusado do módulo transactions — mesma função
 * do autocomplete de Descrição, sem reimplementar); 3) fallback fixo
 * "Outros"/"Outros (Receita)" quando nada bate nem no histórico — nunca fica
 * sem categoria.
 */
export async function resolveCategoryId(
  userId: string,
  type: TelegramTransactionType,
  keywordCandidates: string[],
  description: string,
): Promise<{ id: string; name: string }> {
  const expectedType = type === "INCOME" ? CategoryType.INCOME : CategoryType.EXPENSE;
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree).filter((category) => category.type === expectedType);

  const keywordMatch = matchByKeyword(keywordCandidates, categories);
  if (keywordMatch) {
    return { id: keywordMatch.id, name: keywordMatch.name };
  }

  const historyCategory = await transactionService.lastCategoryForDescription(userId, description);
  if (historyCategory && historyCategory.type === expectedType) {
    return { id: historyCategory.id, name: historyCategory.name };
  }

  const fallback = categories.find((category) => category.name === FALLBACK_CATEGORY_NAME[type]);
  if (!fallback) throw new FallbackCategoryMissingError(userId, type);

  return { id: fallback.id, name: fallback.name };
}

/**
 * Resolve o `categoryName` sugerido pela IA (docs/30-TELEGRAM.md, "Parsing
 * por IA") contra as categorias REAIS do usuário: 1) match EXATO por nome
 * (case/acento-insensível) — diferente de `matchByKeyword` acima (usado pelo
 * parser regex, que casa uma palavra isolada contra PARTES do nome, porque
 * ali as candidatas são palavras soltas da mensagem, não o nome completo
 * escolhido pela IA a partir da lista real). Usa a categoria EXATA que casou
 * (própria OU filha), sem subir pro pai. Sem match exato → cai no
 * `resolveCategoryId` existente (que já aplica keyword → histórico →
 * fallback "Outros"/"Outros (Receita)", sem duplicar essa regra) — cobre
 * tanto o lançamento por texto quanto por foto (ambos passam por aqui,
 * `draft.ts`).
 */
export async function resolveCategoryByName(
  userId: string,
  type: TelegramTransactionType,
  categoryName: string | null,
  description: string,
  fallbackKeywordCandidates: string[],
): Promise<{ id: string; name: string }> {
  const expectedType = type === "INCOME" ? CategoryType.INCOME : CategoryType.EXPENSE;
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree).filter((category) => category.type === expectedType);

  if (categoryName) {
    const normalizedTarget = normalizeWord(categoryName);

    const exactMatch = categories.find((category) => normalizeWord(category.name) === normalizedTarget);
    if (exactMatch) {
      return { id: exactMatch.id, name: exactMatch.name };
    }
  }

  return resolveCategoryId(userId, type, fallbackKeywordCandidates, description);
}

/**
 * Resolve um nome de categoria citado numa CONSULTA (docs/30-TELEGRAM.md,
 * "Consulta por IA") contra as categorias EXPENSE reais do usuário: mesmo
 * match EXATO (case/acento-insensível) de `resolveCategoryByName`, mas SEM
 * fallback pro "Outros" — `null` quando não bate com nenhuma categoria (a
 * consulta responde "categoria não encontrada" em vez de assumir uma
 * default, diferente do fluxo de lançamento). Usado só por `query.ts`
 * (`category_total`/`top_categories`), restrito a EXPENSE porque as
 * agregações de categoria do bot reusam `reportService.expenseByCategory`
 * (só cobre despesas).
 */
export async function matchExpenseCategoryByName(
  userId: string,
  categoryName: string,
): Promise<{ id: string; name: string } | null> {
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree).filter((category) => category.type === CategoryType.EXPENSE);
  const normalizedTarget = normalizeWord(categoryName);

  const match = categories.find((category) => normalizeWord(category.name) === normalizedTarget);
  return match ? { id: match.id, name: match.name } : null;
}

/** Conta ATIVA mais antiga (1ª criada) do usuário — origem default quando nada mais resolve. */
async function findDefaultActiveAccount(userId: string) {
  const accounts = await accountService.listWithBalances(userId);
  const active = accounts.find((account) => account.isActive);
  if (!active) throw new NoActiveAccountError(userId);
  return active;
}

/**
 * Resolve a origem (conta OU cartão) de um lançamento via Telegram
 * (docs/30-TELEGRAM.md, "Parsing por IA"): se a IA identificou uma origem
 * (`originKind`/`originName`) e ela bate — case/acento-insensível — com uma
 * conta/cartão ATIVO real do usuário, usa essa origem; senão cai na conta
 * default (mesmo comportamento de hoje do lançamento rápido regex, ver
 * `findDefaultActiveAccount`). Chamado também pelo caminho regex com
 * `originKind`/`originName` nulos — sempre cai direto no default, sem mudar
 * o comportamento existente.
 */
export async function resolveOrigin(
  userId: string,
  originKind: TelegramOriginKind | null,
  originName: string | null,
): Promise<TelegramOrigin> {
  const normalizedTarget = originName ? normalizeWord(originName) : null;

  if (normalizedTarget && originKind === "card") {
    const cards = await cardService.listCards(userId);
    const match = cards.find((card) => card.isActive && normalizeWord(card.name) === normalizedTarget);
    if (match) return { kind: "card", id: match.id, label: `Cartão ${match.name}` };
  }

  if (normalizedTarget && originKind === "account") {
    const accounts = await accountService.listWithBalances(userId);
    const match = accounts.find((account) => account.isActive && normalizeWord(account.name) === normalizedTarget);
    if (match) return { kind: "account", id: match.id, label: `Conta ${match.name}` };
  }

  const fallback = await findDefaultActiveAccount(userId);
  return { kind: "account", id: fallback.id, label: `Conta ${fallback.name}` };
}

/** `{ accountId }` ou `{ cardId }` pro payload de `createTransactionSchema` — nunca os dois juntos (invariante do schema). Compartilhado por `handlers.ts` (parser regex) e `draft.ts` (fluxo de IA v2). */
export function originPayload(origin: TelegramOrigin): { accountId: string } | { cardId: string } {
  return origin.kind === "card" ? { cardId: origin.id } : { accountId: origin.id };
}

/**
 * Canal de pagamento → tipo de origem esperado (docs/30-TELEGRAM.md,
 * "paymentMethod"): "credit" só resolve pra CARTÃO; "debit"/"pix"/"transfer"/
 * "cash" só resolvem pra CONTA. `null` (canal não identificado pela IA) não
 * restringe — aceita conta OU cartão no match.
 */
const ORIGIN_KIND_BY_PAYMENT_METHOD: Record<TelegramPaymentMethod, TelegramOriginKind> = {
  credit: "card",
  debit: "account",
  pix: "account",
  transfer: "account",
  cash: "account",
};

export function expectedOriginKind(paymentMethod: TelegramPaymentMethod | null): TelegramOriginKind | null {
  return paymentMethod ? ORIGIN_KIND_BY_PAYMENT_METHOD[paymentMethod] : null;
}

/**
 * Palavras de método/canal + preposições de ligação (docs/30-TELEGRAM.md, bug
 * fix "origem faz loop"): removidas do texto citado ANTES de casar contra
 * conta/cartão real — sem isso, "Crédito Nubank" nunca bate com nenhum nome
 * de cartão cadastrado (o núcleo real é só "Nubank"). Aplicada igualmente ao
 * NOME real da conta/cartão (via `originMatchCore` abaixo), então o núcleo
 * comparado é sempre "o nome, sem ruído de canal/ligação" dos dois lados.
 */
const ORIGIN_NOISE_WORDS = new Set([
  "credito",
  "cartao",
  "debito",
  "pix",
  "conta",
  "transferencia",
  "na",
  "no",
  "da",
  "do",
  "de",
]);

/**
 * Núcleo comparável de um texto de origem: `normalizeWord` (acento/caixa) +
 * despontuação ("Nubank - MEI" → "nubank mei", pra não depender de o usuário
 * repetir o traço do nome cadastrado) + remoção de `ORIGIN_NOISE_WORDS` por
 * TOKEN (nunca substring solta — "pixel" não perde nada por conter "pix").
 * String vazia quando o texto era só ruído (ex.: "crédito" sozinho) — sinal
 * pro chamador não tentar casar nada.
 */
function originMatchCore(value: string): string {
  const flattened = normalizeWord(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!flattened) return "";

  return flattened
    .split(/\s+/)
    .filter((token) => !ORIGIN_NOISE_WORDS.has(token))
    .join(" ");
}

/** Candidato de origem (conta ou cartão ATIVO) já com o núcleo comparável calculado — insumo de `findOriginMatches`. */
type OriginCandidate = { origin: TelegramOrigin; core: string };

async function activeOriginCandidates(
  userId: string,
  wantKind: TelegramOriginKind | null,
): Promise<OriginCandidate[]> {
  const candidates: OriginCandidate[] = [];

  if (wantKind === "card" || wantKind === null) {
    const cards = await cardService.listCards(userId);
    for (const card of cards) {
      if (!card.isActive) continue;
      candidates.push({
        origin: { kind: "card", id: card.id, label: `Cartão ${card.name}` },
        core: originMatchCore(card.name),
      });
    }
  }

  if (wantKind === "account" || wantKind === null) {
    const accounts = await accountService.listWithBalances(userId);
    for (const account of accounts) {
      if (!account.isActive) continue;
      candidates.push({
        origin: { kind: "account", id: account.id, label: `Conta ${account.name}` },
        core: originMatchCore(account.name),
      });
    }
  }

  return candidates;
}

/**
 * Casa o núcleo citado (já sem ruído, `originMatchCore`) contra as contas/
 * cartões ATIVOS do tipo esperado. Match EXATO tem prioridade sobre o
 * CONTÉM (docs/30-TELEGRAM.md: "se o usuário digitar o nome cheio, resolve
 * direto") — só cai pro contém (bidirecional: candidato contém o núcleo OU
 * núcleo contém o candidato) quando nenhum exato bateu. 0 resultados = nada
 * bateu; 2+ = ambíguo (`resolveOriginStrict` decide o que fazer com cada
 * caso).
 */
async function findOriginMatches(
  userId: string,
  wantKind: TelegramOriginKind | null,
  core: string,
): Promise<TelegramOrigin[]> {
  const candidates = await activeOriginCandidates(userId, wantKind);

  const exact = candidates.filter((candidate) => candidate.core === core);
  const pool =
    exact.length > 0
      ? exact
      : candidates.filter((candidate) => candidate.core.includes(core) || core.includes(candidate.core));

  return pool.map((candidate) => candidate.origin);
}

/**
 * Resolve a origem pro fluxo de IA v2 (docs/30-TELEGRAM.md, "Fluxo
 * conversacional") — DIFERENTE de `resolveOrigin` acima (usado pelo parser
 * regex/fallback determinístico): aqui NÃO existe fallback pra conta default.
 * Fonte ÚNICA de matching de origem por texto livre (docs/30-TELEGRAM.md, bug
 * fix): tanto o `originName` já vindo da IA quanto o texto de uma resposta de
 * pending (`pending-merge.ts` só extrai o texto bruto, não casa contra o
 * banco — DRY, evita duplicar essa lógica em 2 lugares) passam por aqui.
 *
 * Sem `originName`/núcleo (`originMatchCore`) → `{ status: "none" }`. Com
 * núcleo, casa (`findOriginMatches`, respeitando o tipo esperado via
 * `expectedOriginKind`) contra contas/cartões ATIVOS: 1 resultado →
 * `"resolved"`; 2+ (ex.: "Nubank" batendo em "Nubank - Pessoal" E "Nubank -
 * MEI") → `"ambiguous"` — o chamador (`draft.ts`) pergunta qual, listando os
 * candidatos, em vez do genérico "De onde saiu?"; 0 → `"none"`, mesmo sinal
 * de sempre pro fluxo de pergunta.
 */
export async function resolveOriginStrict(
  userId: string,
  paymentMethod: TelegramPaymentMethod | null,
  originKind: TelegramOriginKind | null,
  originName: string | null,
): Promise<OriginMatchResult> {
  if (!originName) return { status: "none" };

  const core = originMatchCore(originName);
  if (!core) return { status: "none" };

  const wantKind = expectedOriginKind(paymentMethod) ?? originKind;
  const matches = await findOriginMatches(userId, wantKind, core);

  if (matches.length === 0) return { status: "none" };
  if (matches.length === 1) return { status: "resolved", origin: matches[0] };
  return { status: "ambiguous", candidates: matches };
}

/** Nomes das categorias (ambos os tipos) do usuário — insumo do prompt da IA pra escolher a categoria mais próxima. */
export async function listCategoryNamesForAI(userId: string): Promise<string[]> {
  const tree = await categoryService.listTree(userId);
  return flattenTree(tree).map((category) => category.name);
}

/** Cap de botões de categoria no teclado inline (Telegram fica ilegível com dezenas). */
const CATEGORY_BUTTONS_LIMIT = 16;

/**
 * Categorias do tipo pedido pra teclado "Trocar categoria" (docs/30-TELEGRAM.md —
 * fluxo híbrido médio). Árvore achatada, filhas primeiro quando possível
 * (mais específicas), limitada a `CATEGORY_BUTTONS_LIMIT`.
 */
export async function listCategoriesForButtons(
  userId: string,
  type: TelegramTransactionType,
): Promise<Array<{ id: string; name: string }>> {
  const expectedType = type === "INCOME" ? CategoryType.INCOME : CategoryType.EXPENSE;
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree).filter((category) => category.type === expectedType);

  // Filhas (parentId set) antes dos pais — granularidade específica no teclado.
  const sorted = [...categories].sort((a, b) => {
    const aChild = a.parentId ? 0 : 1;
    const bChild = b.parentId ? 0 : 1;
    if (aChild !== bChild) return aChild - bChild;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return sorted.slice(0, CATEGORY_BUTTONS_LIMIT).map((category) => ({
    id: category.id,
    name: category.name,
  }));
}

/**
 * Contas + cartões ATIVOS pra teclado de origem (pending ou "Trocar origem").
 * `wantKind` restringe quando o paymentMethod já aponta cartão vs conta;
 * `null` lista os dois.
 */
export async function listActiveOriginsForButtons(
  userId: string,
  wantKind: TelegramOriginKind | null,
): Promise<TelegramOrigin[]> {
  const candidates = await activeOriginCandidates(userId, wantKind);
  return candidates.map((candidate) => candidate.origin);
}

/** Nomes de contas + cartões ATIVOS do usuário — insumo do prompt da IA pra escolher a origem do lançamento. */
export async function listOriginNamesForAI(
  userId: string,
): Promise<{ accountNames: string[]; cardNames: string[] }> {
  const [accounts, cards] = await Promise.all([accountService.listWithBalances(userId), cardService.listCards(userId)]);

  return {
    accountNames: accounts.filter((account) => account.isActive).map((account) => account.name),
    cardNames: cards.filter((card) => card.isActive).map((card) => card.name),
  };
}

/** Top ~40 merchants (docs/30-TELEGRAM.md, "Parsing por IA") — compacto o bastante pro prompt não explodir em tokens. */
const KNOWN_MERCHANTS_LIMIT = 40;

/**
 * Pagadores/merchants conhecidos do usuário — insumo do prompt da IA pra
 * casar semanticamente a descrição de uma transação nova contra um histórico
 * já categorizado (docs/30-TELEGRAM.md, "Parsing por IA"), em vez do match
 * exato frágil de `resolveCategoryId`/`lastCategoryForDescription`. Reusa
 * `transactionService.listKnownMerchants` (módulo transactions, sem
 * duplicar a query aqui).
 */
export async function listKnownMerchantsForAI(userId: string): Promise<KnownMerchant[]> {
  return transactionService.listKnownMerchants(userId, KNOWN_MERCHANTS_LIMIT);
}

/** Nomes dos Assets INVESTMENT — insumo do prompt (consulta + aporte via Telegram). */
export async function listInvestmentNamesForAI(userId: string): Promise<string[]> {
  const investments = await investmentService.list(userId);
  return investments.map((item) => item.name);
}

/**
 * Resolve nome de investimento citado (aporte/consulta) — match exato
 * case/acento-insensível, depois "contém" se único. Sem fallback inventado.
 */
export async function matchInvestmentByName(
  userId: string,
  investmentName: string,
): Promise<{ id: string; name: string } | null> {
  const investments = await investmentService.list(userId);
  const normalizedTarget = normalizeWord(investmentName);
  if (!normalizedTarget) return null;

  const exact = investments.find((item) => normalizeWord(item.name) === normalizedTarget);
  if (exact) return { id: exact.id, name: exact.name };

  const contains = investments.filter((item) => {
    const name = normalizeWord(item.name);
    return name.includes(normalizedTarget) || normalizedTarget.includes(name);
  });
  if (contains.length === 1) return { id: contains[0].id, name: contains[0].name };

  return null;
}

/** Conta ativa por nome (aporte) — null se não achar; caller usa default. */
export async function matchActiveAccountByName(
  userId: string,
  accountName: string,
): Promise<{ id: string; name: string } | null> {
  const accounts = await accountService.listWithBalances(userId);
  const normalizedTarget = normalizeWord(accountName);
  const match = accounts.find(
    (account) => account.isActive && normalizeWord(account.name) === normalizedTarget,
  );
  return match ? { id: match.id, name: match.name } : null;
}

/** Conta ativa default (mais antiga) — mesma regra de `findDefaultActiveAccount`. */
export async function resolveDefaultActiveAccount(
  userId: string,
): Promise<{ id: string; name: string }> {
  const account = await findDefaultActiveAccount(userId);
  return { id: account.id, name: account.name };
}

/** Categoria EXPENSE "Investimento (aporte)" do seed — null se o usuário apagou. */
export async function findAporteCategoryId(userId: string): Promise<string | null> {
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree).filter((category) => category.type === CategoryType.EXPENSE);
  const match = categories.find((category) => category.name === "Investimento (aporte)");
  return match?.id ?? null;
}
