import { auth } from "@/lib/auth";
import { categoryService } from "@/modules/categories/service";
import { CategoriesView } from "@/components/categories/categories-view";

/**
 * `/categories` (docs/24-CATEGORIES.md). Server Component: lê a árvore via
 * `categoryService.listTree` direto (sem passar por Server Action — Server
 * Actions aqui são só para mutations disparadas pelo client, ver
 * docs/99-CLAUDE.md "Regra de Ouro"). Todos os campos de `Category` são
 * nativamente serializáveis por RSC (string/enum/Date/null) — sem
 * necessidade de converter nada na borda (diferente de `Prisma.Decimal`
 * em `accounts`/`cards`).
 */
export default async function CategoriesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const tree = await categoryService.listTree(userId);

  return <CategoriesView tree={tree} />;
}
