import { NextResponse, type NextRequest } from "next/server";
import { recurringService } from "@/modules/recurring/service";

/**
 * Route Handler — exceção documentada em docs/99-CLAUDE.md: Server Actions
 * são o padrão para mutations do app, mas crons usam Route Handler porque
 * são chamados por um agente externo (Vercel Cron/Railway Cron), não pelo
 * navegador do usuário (mesmo padrão de `/api/cron/weekly-summary`, ver
 * docs/29-ALERTS.md).
 *
 * Gera as Transactions de TODOS os usuários cujos templates ativos estão
 * vencidos (`nextRun <= now`) — cron global, não escopado a uma sessão.
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

  const generated = await recurringService.runDue();

  return NextResponse.json({ generatedCount: generated.length });
}
