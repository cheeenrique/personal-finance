/**
 * Teclados inline do bot (docs/30-TELEGRAM.md — fluxo híbrido médio).
 * `callback_data` ≤ 64 bytes (limite da Bot API). Ownership da tx/pending
 * sempre revalidada no handler pelo `userId` do webhook secret — o data só
 * carrega ids, nunca tokens.
 */

export type InlineKeyboardButton = { text: string; callback_data: string };
export type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] };

/** Pós-save: Desfazer | Trocar categoria | Trocar origem. */
export function buildPostSaveKeyboard(transactionId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Desfazer", callback_data: `ud:${transactionId}` },
        { text: "Trocar categoria", callback_data: `mc:${transactionId}` },
        { text: "Trocar origem", callback_data: `mo:${transactionId}` },
      ],
    ],
  };
}

/** Lista de categorias (1 por linha) + Voltar ao teclado médio. */
export function buildCategoryPickKeyboard(
  transactionId: string,
  categories: Array<{ id: string; name: string }>,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = categories.map((category) => [
    { text: truncateLabel(category.name), callback_data: `sc:${transactionId}:${category.id}` },
  ]);
  rows.push([{ text: "« Voltar", callback_data: `vb:${transactionId}` }]);
  return { inline_keyboard: rows };
}

/** Lista de contas/cartões + Voltar. */
export function buildOriginPickKeyboard(
  transactionId: string,
  origins: Array<{ kind: "account" | "card"; id: string; label: string }>,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = origins.map((origin) => {
    const prefix = origin.kind === "account" ? "a" : "c";
    return [
      {
        text: truncateLabel(origin.label),
        callback_data: `so:${transactionId}:${prefix}:${origin.id}`,
      },
    ];
  });
  rows.push([{ text: "« Voltar", callback_data: `vb:${transactionId}` }]);
  return { inline_keyboard: rows };
}

/**
 * Pergunta de origem no pending — botões de conta/cartão + Cancelar.
 * Prefixo `po:` (pending origin), sem txId (ainda não existe).
 */
export function buildPendingOriginKeyboard(
  origins: Array<{ kind: "account" | "card"; id: string; label: string }>,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = origins.map((origin) => {
    const prefix = origin.kind === "account" ? "a" : "c";
    return [{ text: truncateLabel(origin.label), callback_data: `po:${prefix}:${origin.id}` }];
  });
  rows.push([{ text: "Cancelar", callback_data: "px" }]);
  return { inline_keyboard: rows };
}

/** Telegram mostra ~64 chars no botão; corta com reticências. */
function truncateLabel(label: string, max = 40): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}
