import { auth } from "@/lib/auth";
import { tagService } from "@/modules/tags/service";
import { TagGrid } from "@/components/tags/tag-grid";

/**
 * `/tags` (docs/25-TAGS.md + docs/06-SCREENS.md, "Tags"). Título e descrição
 * da rota já vêm do Header via `nav-config.ts` — a página só renderiza o
 * conteúdo. Server Component lê `tagService.listTags` direto (sem passar
 * pela Server Action — Server Actions existem para mutations disparadas
 * pelo client, docs/99-CLAUDE.md "Regra de Ouro"), mesma decisão de
 * `(app)/accounts/page.tsx`. `Tag` não carrega `Prisma.Decimal`, então desce
 * pro Client Component sem conversão na borda.
 */
export default async function TagsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const tags = await tagService.listTags(userId);

  return <TagGrid tags={tags} />;
}
