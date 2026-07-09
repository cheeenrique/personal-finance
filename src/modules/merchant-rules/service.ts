import { Prisma, type MerchantCategoryRule } from "@/generated/prisma/client";
import { categoryRepository } from "@/modules/categories/repository";
import { merchantRuleRepository } from "./repository";
import { MerchantRuleAlreadyExistsError, MerchantRuleCategoryNotFoundError, MerchantRuleNotFoundError } from "./errors";
import type { CreateMerchantRuleInput } from "./schemas";

/** Códigos de erro do Postgres via Prisma — ver https://www.prisma.io/docs/orm/reference/error-reference. */
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
}

/**
 * Normaliza texto pra comparação de merchant (lowercase + sem acento via NFD
 * + espaços colapsados) — aplicada IGUAL ao `pattern` gravado e à `description`
 * consultada em `resolveCategoryOverride`, senão a mesma regra bate diferente
 * dependendo do lado. Função própria (não reusa `telegram/normalize.ts`
 * `normalizeWord`) de propósito: `merchant-rules` é consumido pelo módulo
 * `telegram` (`resolve.ts`) — importar de volta criaria dependência circular
 * entre os dois módulos (docs/99-CLAUDE.md, módulos não se acoplam de volta).
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Override determinístico merchant→categoria (docs/superpowers/specs/
 * 2026-07-08-telegram-recibo-categoria-refino-design.md): a categoria da
 * regra cujo `pattern` normalizado é SUBSTRING da `description` normalizada
 * GANHA de tudo (IA, dominante do histórico, keyword). Quando mais de um
 * `pattern` bate, vence o mais LONGO (mais específico) — ex.: "eldora" e
 * "filial eldora" cadastrados, "Filial Eldora" bate nos dois, vence "filial
 * eldora". `null` quando nenhuma regra bate (chamador segue pro próximo
 * critério da cadeia de resolução).
 *
 * Performance: 1 query (`findActiveByUser`) + comparação em memória O(n) nas
 * regras do usuário — sem N+1 mesmo com várias regras cadastradas.
 */
async function resolveCategoryOverride(userId: string, description: string): Promise<string | null> {
  const normalizedDescription = normalize(description);
  if (!normalizedDescription) return null;

  const rules = await merchantRuleRepository.findActiveByUser(userId);

  let bestPattern = "";
  let bestCategoryId: string | null = null;

  for (const rule of rules) {
    const normalizedPattern = normalize(rule.pattern);
    if (!normalizedPattern || !normalizedDescription.includes(normalizedPattern)) continue;
    if (normalizedPattern.length <= bestPattern.length) continue;

    bestPattern = normalizedPattern;
    bestCategoryId = rule.categoryId;
  }

  return bestCategoryId;
}

async function listRules(userId: string): Promise<MerchantCategoryRule[]> {
  return merchantRuleRepository.listByUser(userId);
}

/**
 * Cria a regra — categoria precisa pertencer ao usuário (docs/10-AUTH.md,
 * "Regra Principal de Segurança") e o `pattern` é normalizado ANTES de gravar
 * (mesma normalização de `resolveCategoryOverride`, senão a regra nunca
 * bateria em nada). Unique (userId, pattern) do schema vira erro de domínio
 * claro em vez de estourar o P2002 cru pro chamador.
 */
async function createRule(userId: string, input: CreateMerchantRuleInput): Promise<MerchantCategoryRule> {
  const category = await categoryRepository.findById(userId, input.categoryId);
  if (!category) throw new MerchantRuleCategoryNotFoundError(input.categoryId);

  const normalizedPattern = normalize(input.pattern);

  try {
    return await merchantRuleRepository.create(userId, {
      pattern: normalizedPattern,
      categoryId: input.categoryId,
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new MerchantRuleAlreadyExistsError(normalizedPattern, error);
    }
    throw error;
  }
}

/** Soft delete (mesma convenção de tags/categories/accounts). */
async function deleteRule(userId: string, id: string): Promise<void> {
  const deleted = await merchantRuleRepository.softDelete(userId, id);
  if (!deleted) throw new MerchantRuleNotFoundError(id);
}

export const merchantRuleService = { resolveCategoryOverride, listRules, createRule, deleteRule };
