/**
 * Dot de cor por cartão na listagem de parcelamentos — puramente decorativo
 * (docs/23-INSTALLMENTS.md): ajuda a escanear visualmente quais compras são
 * do mesmo cartão sem repetir o nome inteiro em destaque. Paleta FIXA de
 * tokens já usados no design system (nenhuma cor nova) — hash determinístico
 * do nome do cartão escolhe a classe, então o mesmo cartão sempre cai na
 * mesma cor.
 */
const CARD_DOT_COLORS = ["bg-asset", "bg-transfer", "bg-success", "bg-warning", "bg-accent", "bg-primary"];

/** Classe `bg-*` determinística pro nome do cartão (soma de charCodes % paleta). */
export function cardColorClass(cardName: string): string {
  const hash = [...cardName].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CARD_DOT_COLORS[hash % CARD_DOT_COLORS.length];
}
