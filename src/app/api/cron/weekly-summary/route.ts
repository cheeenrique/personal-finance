import { NextResponse, type NextRequest } from "next/server";
import { alertService } from "@/modules/alerts/service";

/**
 * Route Handler — exceção documentada em docs/99-CLAUDE.md/docs/29-ALERTS.md:
 * Server Actions são o padrão para mutations do app, mas crons usam Route
 * Handler porque são chamados por um agente externo (Vercel Cron/Railway
 * Cron), não pelo navegador do usuário (mesmo padrão de
 * `/api/cron/recurring`).
 *
 * Gera os alertas (resumo semanal + anomalia + verde) de TODOS os usuários —
 * cron global, agendado domingo 08:00 America/Sao_Paulo (11:00 UTC),
 * conforme `vercel.json` (ver docs/29-ALERTS.md, "Cron Job").
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

  const summary = await alertService.runWeeklyForAllUsers();

  return NextResponse.json(summary);
}
