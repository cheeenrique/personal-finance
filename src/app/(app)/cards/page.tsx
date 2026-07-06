import { listCardsAction } from "@/modules/cards/actions";
import { CardsGrid } from "@/components/cards/cards-grid";
import { serializeCardSummary } from "@/components/cards/serialize";

/**
 * Grid de cartões (docs/22-CREDIT_CARDS.md, "Cards na listagem"). Título e
 * descrição da rota já vêm do Header via `nav-config.ts` — a página só
 * renderiza o conteúdo.
 */
export default async function CardsPage() {
  const result = await listCardsAction();

  return (
    <CardsGrid
      cards={result.success ? result.data.map(serializeCardSummary) : []}
      loadError={result.success ? null : result.error.message}
    />
  );
}
