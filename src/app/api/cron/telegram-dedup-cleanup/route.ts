import { NextResponse, type NextRequest } from "next/server";
import { telegramDedupRepository } from "@/modules/telegram/dedup";

/**
 * Route Handler — exceção documentada em docs/99-CLAUDE.md: Server Actions
 * são o padrão para mutations do app, mas crons usam Route Handler porque
 * são chamados por um agente externo (Vercel Cron/Railway Cron), não pelo
 * navegador do usuário (mesmo padrão de `/api/cron/recurring` e
 * `/api/cron/weekly-summary`).
 *
 * Apaga registros de `TelegramProcessedUpdate` (dedup do webhook do
 * Telegram) com mais de 7 dias — a tabela cresce a cada mensagem processada
 * e nunca é limpa; o Telegram só reenvia um `update_id` dentro de minutos
 * após timeout, então 7 dias é retenção seguríssima.
 *
 * Proteção: header `Authorization: Bearer <CRON_SECRET>`. Sem o header
 * correto (ou sem `CRON_SECRET` configurado no ambiente) → 401, nada é
 * processado.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deletedCount = await telegramDedupRepository.cleanupOlderThan(7);

  return NextResponse.json({ deletedCount });
}
