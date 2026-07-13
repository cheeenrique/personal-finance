import { CategoryType } from "@/generated/prisma/enums";
import { categoryService } from "@/modules/categories/service";
import { CategoryDomainError } from "@/modules/categories/errors";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { normalizeWord } from "./normalize";
import { matchCategoryByName } from "./resolve";
import {
  buildCategoryCreatedReply,
  buildCategoryDuplicateReply,
  buildCategoryNeedNameReply,
  buildCategoryParentNotFoundReply,
  buildErrorReply,
} from "./reply";
import type { CommandResult, TelegramCreateCategoryParsed } from "./types";

function flattenTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  const flat: CategoryTreeNode[] = [];
  for (const node of nodes) {
    flat.push(node);
    flat.push(...flattenTree(node.children));
  }
  return flat;
}

/**
 * Checa duplicidade (mesmo nome normalizado, mesmo `parentId`, mesmo `type`)
 * ANTES de criar — regra NOVA só do bot (docs/30-TELEGRAM.md, "Criar
 * categoria pelo Telegram"): o app web já convive com nomes duplicados
 * (`categoryService.createCategory` não valida isso, nem há `@@unique` no
 * schema), fora de escopo mudar esse comportamento pro app inteiro. Reusa
 * `categoryService.listTree` + `normalizeWord` (mesmo padrão de `resolve.ts`,
 * `matchCategoryByName`).
 */
async function findExistingByName(
  userId: string,
  name: string,
  parentId: string | null,
  type: CategoryType,
): Promise<boolean> {
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree);
  const normalizedTarget = normalizeWord(name);

  return categories.some(
    (category) =>
      category.parentId === parentId &&
      category.type === type &&
      normalizeWord(category.name) === normalizedTarget,
  );
}

/**
 * Cria categoria via Telegram (`intent="create_category"`, docs/30-TELEGRAM.md).
 * Domain logic (validação de pai/tipo, criação) fica 100% em
 * `categoryService` (docs/99-CLAUDE.md, "Regra de Ouro") — este handler só
 * orquestra: resolve nomes → checa duplicidade → chama o service → formata
 * resposta.
 *
 * Sem `parentName` → categoria PAI top-level, sempre `type=EXPENSE`
 * (decisão do dono — v1 não cria categoria de receita via bot). Com
 * `parentName` → resolve o pai por nome EXATO normalizado
 * (`matchCategoryByName`, busca nos dois tipos); pai não encontrado →
 * resposta amigável (nunca cria sob um pai "chutado"); pai encontrado →
 * cria filha herdando o `type` do pai (`categoryService.createCategory` já
 * valida essa invariante, `CategoryParentTypeMismatchError`, mas o handler
 * sempre passa `type: parent.type`, então esse erro não deveria disparar
 * aqui na prática).
 *
 * Duplicata (nome igual, mesmo pai/top-level, mesmo tipo) é BLOQUEADA pelo
 * bot antes de chamar o service — regra nova só do Telegram, não muda o
 * comportamento do app web.
 */
export async function handleCreateCategory(
  userId: string,
  input: TelegramCreateCategoryParsed,
): Promise<CommandResult> {
  if (!input.categoryName) {
    return { text: buildCategoryNeedNameReply(), resultCode: "create_category_need_name" };
  }

  if (!input.parentName) {
    const duplicate = await findExistingByName(userId, input.categoryName, null, CategoryType.EXPENSE);
    if (duplicate) {
      return { text: buildCategoryDuplicateReply(input.categoryName), resultCode: "create_category_duplicate" };
    }

    const category = await categoryService.createCategory(userId, {
      name: input.categoryName,
      type: CategoryType.EXPENSE,
    });
    return { text: buildCategoryCreatedReply(category.name, null), resultCode: "create_category_created" };
  }

  const parent = await matchCategoryByName(userId, input.parentName);
  if (!parent) {
    return {
      text: buildCategoryParentNotFoundReply(input.parentName),
      resultCode: "create_category_parent_not_found",
    };
  }

  const duplicate = await findExistingByName(userId, input.categoryName, parent.id, parent.type);
  if (duplicate) {
    return { text: buildCategoryDuplicateReply(input.categoryName), resultCode: "create_category_duplicate" };
  }

  try {
    const category = await categoryService.createCategory(userId, {
      name: input.categoryName,
      type: parent.type,
      parentId: parent.id,
    });
    return {
      text: buildCategoryCreatedReply(category.name, parent.name),
      resultCode: "create_category_created",
    };
  } catch (error) {
    if (error instanceof CategoryDomainError) {
      return { text: buildErrorReply(error.message), resultCode: "create_category_error" };
    }
    throw error;
  }
}
