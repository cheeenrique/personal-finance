import { accountService } from "@/modules/accounts/service";
import { cardService } from "@/modules/cards/service";
import { categoryService } from "@/modules/categories/service";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { TransactionDomainError } from "@/modules/transactions/errors";
import { transactionService } from "@/modules/transactions/service";
import { draftFromOriginIds, processDraft } from "./draft";
import {
  buildCategoryPickKeyboard,
  buildOriginPickKeyboard,
  buildPostSaveKeyboard,
  type InlineKeyboardMarkup,
} from "./inline-keyboard";
import { telegramPendingRepository } from "./pending";
import {
  buildErrorReply,
  buildPendingCancelledReply,
  buildTransactionConfirmationReply,
  buildTransactionUndoneReply,
} from "./reply";
import { listActiveOriginsForButtons, listCategoriesForButtons } from "./resolve";
import type { CommandResult, TelegramTransactionType } from "./types";

/**
 * Resultado de um callback_query — além do texto/teclado pra editar a
 * mensagem original, `answerText` opcional vira toast curto no Telegram
 * (`answerCallbackQuery`).
 */
export type CallbackResult = CommandResult & {
  answerText?: string;
  /** Quando true, remove o reply_markup (ex.: após Desfazer). */
  clearKeyboard?: boolean;
};

/**
 * Interpreta `callback_data` e aplica a ação (docs/30-TELEGRAM.md — fluxo
 * híbrido médio). Ownership sempre via `userId` do secret do webhook —
 * nunca confiar só no id embutido no data. Retorna texto + teclado pra
 * `editMessageText` no route.
 */
export async function handleCallbackQuery(userId: string, data: string): Promise<CallbackResult> {
  try {
    if (data === "px") {
      await telegramPendingRepository.remove(userId);
      return {
        text: buildPendingCancelledReply(),
        resultCode: "pending_cancelled",
        answerText: "Cancelado",
        clearKeyboard: true,
      };
    }

    if (data.startsWith("po:")) {
      return handlePendingOriginPick(userId, data);
    }

    if (data.startsWith("ud:")) {
      return handleUndo(userId, data.slice(3));
    }

    if (data.startsWith("mc:")) {
      return handleMenuCategory(userId, data.slice(3));
    }

    if (data.startsWith("mo:")) {
      return handleMenuOrigin(userId, data.slice(3));
    }

    if (data.startsWith("vb:")) {
      return handleBackToPostSave(userId, data.slice(3));
    }

    if (data.startsWith("sc:")) {
      const rest = data.slice(3);
      const sep = rest.indexOf(":");
      if (sep <= 0) return unknownCallback();
      return handleSetCategory(userId, rest.slice(0, sep), rest.slice(sep + 1));
    }

    if (data.startsWith("so:")) {
      // so:{txId}:a:{id} | so:{txId}:c:{id}
      const parts = data.split(":");
      if (parts.length !== 4) return unknownCallback();
      const [, txId, kindPrefix, originId] = parts;
      if (kindPrefix !== "a" && kindPrefix !== "c") return unknownCallback();
      return handleSetOrigin(userId, txId, kindPrefix === "a" ? "account" : "card", originId);
    }

    return unknownCallback();
  } catch (error) {
    if (error instanceof TransactionDomainError) {
      return { text: buildErrorReply(error.message), resultCode: "error", answerText: "Erro" };
    }
    console.error("[modules/telegram] unexpected error in callback", {
      prefix: data.slice(0, 2),
    });
    return {
      text: buildErrorReply("Não foi possível processar essa ação agora."),
      resultCode: "error",
      answerText: "Erro",
    };
  }
}

function unknownCallback(): CallbackResult {
  return {
    text: buildErrorReply("Ação inválida ou expirada."),
    resultCode: "callback_unknown",
    answerText: "Inválido",
    clearKeyboard: true,
  };
}

async function resolveOriginNameById(
  userId: string,
  kind: "account" | "card",
  originId: string,
): Promise<string | null> {
  if (kind === "account") {
    const accounts = await accountService.listWithBalances(userId);
    return accounts.find((account) => account.id === originId && account.isActive)?.name ?? null;
  }
  const cards = await cardService.listCards(userId);
  return cards.find((card) => card.id === originId && card.isActive)?.name ?? null;
}

async function handlePendingOriginPick(userId: string, data: string): Promise<CallbackResult> {
  // po:a:{id} | po:c:{id}
  const parts = data.split(":");
  if (parts.length !== 3) return unknownCallback();
  const [, kindPrefix, originId] = parts;
  if (kindPrefix !== "a" && kindPrefix !== "c") return unknownCallback();

  const pending = await telegramPendingRepository.getActive(userId);
  if (!pending || pending.missingField !== "origin") {
    return {
      text: buildErrorReply("Não há lançamento pendente pra completar."),
      resultCode: "pending_missing",
      answerText: "Expirado",
      clearKeyboard: true,
    };
  }

  const kind = kindPrefix === "a" ? "account" : "card";
  const originName = await resolveOriginNameById(userId, kind, originId);
  if (!originName) return unknownCallback();

  const draft = draftFromOriginIds(pending.draft, kind, originName);
  const result = await processDraft(userId, draft, pending.attempts);
  return { ...result, answerText: "Ok" };
}

async function handleUndo(userId: string, transactionId: string): Promise<CallbackResult> {
  await transactionService.deleteTransaction(userId, transactionId);
  return {
    text: buildTransactionUndoneReply(),
    resultCode: "transaction_undone",
    answerText: "Desfeito",
    clearKeyboard: true,
  };
}

async function handleMenuCategory(userId: string, transactionId: string): Promise<CallbackResult> {
  const tx = await transactionService.getTransaction(userId, transactionId);
  const type = tx.type as TelegramTransactionType;
  if (type !== "EXPENSE" && type !== "INCOME") {
    return { text: buildErrorReply("Tipo não editável por aqui."), resultCode: "callback_bad_type" };
  }

  const categories = await listCategoriesForButtons(userId, type);
  const confirmation = await buildConfirmationFromTransaction(userId, transactionId);
  return {
    text: `${confirmation.text}\n\nEscolha a categoria:`,
    resultCode: "menu_category",
    replyMarkup: buildCategoryPickKeyboard(transactionId, categories),
    answerText: "Categorias",
  };
}

async function handleMenuOrigin(userId: string, transactionId: string): Promise<CallbackResult> {
  const origins = await listActiveOriginsForButtons(userId, null);
  const confirmation = await buildConfirmationFromTransaction(userId, transactionId);
  return {
    text: `${confirmation.text}\n\nEscolha a origem:`,
    resultCode: "menu_origin",
    replyMarkup: buildOriginPickKeyboard(transactionId, origins),
    answerText: "Origens",
  };
}

async function handleBackToPostSave(userId: string, transactionId: string): Promise<CallbackResult> {
  const confirmation = await buildConfirmationFromTransaction(userId, transactionId);
  return {
    ...confirmation,
    replyMarkup: buildPostSaveKeyboard(transactionId),
    answerText: "Ok",
  };
}

async function handleSetCategory(
  userId: string,
  transactionId: string,
  categoryId: string,
): Promise<CallbackResult> {
  await transactionService.updateTransaction(userId, transactionId, { categoryId });
  const confirmation = await buildConfirmationFromTransaction(userId, transactionId);
  return {
    ...confirmation,
    replyMarkup: buildPostSaveKeyboard(transactionId),
    answerText: "Categoria atualizada",
  };
}

async function handleSetOrigin(
  userId: string,
  transactionId: string,
  kind: "account" | "card",
  originId: string,
): Promise<CallbackResult> {
  const patch =
    kind === "account"
      ? { accountId: originId, cardId: null }
      : { cardId: originId, accountId: null };

  await transactionService.updateTransaction(userId, transactionId, patch);
  const confirmation = await buildConfirmationFromTransaction(userId, transactionId);
  return {
    ...confirmation,
    replyMarkup: buildPostSaveKeyboard(transactionId),
    answerText: "Origem atualizada",
  };
}

/**
 * Remonta o texto de confirmação a partir da tx persistida (após update ou
 * "Voltar"). Precisa de nomes de categoria/conta/cartão — ids sozinhos não
 * bastam pra UI.
 */
async function buildConfirmationFromTransaction(
  userId: string,
  transactionId: string,
): Promise<{ text: string; resultCode: string }> {
  const tx = await transactionService.getTransaction(userId, transactionId);
  const type = (tx.type === "INCOME" ? "INCOME" : "EXPENSE") as TelegramTransactionType;

  let categoryName = type === "INCOME" ? "Outros (Receita)" : "Outros";
  if (tx.categoryId) {
    const tree = await categoryService.listTree(userId);
    categoryName = findCategoryName(tree, tx.categoryId) ?? categoryName;
  }

  let originLabel = "—";
  if (tx.accountId) {
    const accounts = await accountService.listWithBalances(userId);
    const account = accounts.find((a) => a.id === tx.accountId);
    originLabel = account ? `Conta ${account.name}` : "Conta";
  } else if (tx.cardId) {
    const cards = await cardService.listCards(userId);
    const card = cards.find((c) => c.id === tx.cardId);
    originLabel = card ? `Cartão ${card.name}` : "Cartão";
  }

  return {
    text: buildTransactionConfirmationReply({
      type,
      description: tx.description,
      amount: tx.amount.toString(),
      categoryName,
      originLabel,
      date: tx.date,
      isPaid: tx.isPaid,
    }),
    resultCode: "transaction_updated",
  };
}

function findCategoryName(nodes: CategoryTreeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    const nested = findCategoryName(node.children, id);
    if (nested) return nested;
  }
  return null;
}

export type { InlineKeyboardMarkup };
