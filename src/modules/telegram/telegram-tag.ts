import { tagService } from "@/modules/tags/service";

/**
 * Nome/cor da tag automática aplicada a TODA transação criada pelo bot
 * (requisito do dono — nunca em transações criadas pela UI web). Mesmo nome/
 * cor já usados no seed de demonstração (`prisma/seed-demo.ts`) — mantém
 * consistência visual entre o dado de demo e o dado real gerado pelo Telegram.
 */
const TELEGRAM_TAG_NAME = "Telegram";
const TELEGRAM_TAG_COLOR = "#0EA5E9";

/**
 * Find-or-create idempotente (`tagService.findOrCreateByName`) — nunca
 * duplica a tag em execuções repetidas (mesmo nome, case-insensitive).
 * Chamado por AMBOS os caminhos de criação de transação via bot (parser regex
 * em `handlers.ts` e o fluxo de IA v2 em `draft.ts`).
 */
export async function resolveTelegramTagId(userId: string): Promise<string> {
  const tag = await tagService.findOrCreateByName(userId, TELEGRAM_TAG_NAME, TELEGRAM_TAG_COLOR);
  return tag.id;
}
