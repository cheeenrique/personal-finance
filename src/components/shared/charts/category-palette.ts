/**
 * Paleta cíclica de cor por categoria — mesmos tokens do design system
 * (docs/04-DESIGN_SYSTEM.md, "Gráficos"), usada por
 * `dashboard/expense-category-chart.tsx` (donut + árvore). Ordem escolhida
 * pra maximizar a distância de matiz entre posições vizinhas do ciclo
 * (accent #EA580C e warning #F59E0B são quase o mesmo laranja — só 17° de
 * diferença — então ficam em extremos opostos do ciclo em vez de lado a
 * lado; docs/50-AUDITORIA-BACKLOG.md, LA6).
 */
const CATEGORY_PALETTE_TOKENS = [
  "var(--primary)",
  "var(--accent)",
  "var(--transfer)",
  "var(--destructive)",
  "var(--success)",
  "var(--asset)",
  "var(--warning)",
] as const;

 * Cor da categoria na posição `index` (já ordenada por total desc). A partir
 * da 2ª volta do ciclo (8ª fatia em diante) a cor não repete crua — nesse
 * ponto ela ficaria encostada na 1ª fatia do mesmo tom no anel do donut e as
 * duas se fundiriam visualmente (LA6). Cada volta escurece progressivamente
 * o tom (`color-mix`, mantém reatividade ao tema via `var(--token)`) até um
 * teto de 45%, reconhecível como "o mesmo matiz, mais escuro" em vez de
 * idêntico.
 */
export function resolveCategoryColor(index: number): string {
  const paletteSize = CATEGORY_PALETTE_TOKENS.length;
  const token = CATEGORY_PALETTE_TOKENS[index % paletteSize];
  const lap = Math.floor(index / paletteSize);
  if (lap === 0) return token;

  const darkenPercent = Math.min(lap * 15, 45);
  return `color-mix(in oklch, ${token} ${100 - darkenPercent}%, black)`;
}
