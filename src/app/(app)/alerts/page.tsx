import { Suspense } from "react";
import { Inbox, Info } from "lucide-react";

import { auth } from "@/lib/auth";
import { AlertType } from "@/generated/prisma/enums";
import { alertService } from "@/modules/alerts/service";
import { settingsService } from "@/modules/settings/service";
import { formatBRL } from "@/lib/money/format";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertFilters, type StatusFilterValue } from "@/components/alerts/alert-filters";
import { AlertsList } from "@/components/alerts/alerts-list";

const ALERT_TYPE_VALUES = new Set<string>(Object.values(AlertType));
const STATUS_FILTER_VALUES = new Set<string>(["all", "read", "unread"]);

type AlertsPageProps = {
  searchParams: Promise<{ type?: string; status?: string }>;
};

/**
 * `/alerts` (docs/06-SCREENS.md, "Alertas"): histórico completo de alertas
 * gerados pelo sistema, inclusive os já lidos — o Dashboard só mostra os
 * ativos (`readAt = null`). Server Component lê `alertService` direto, sem
 * Server Action (docs/99-CLAUDE.md, "Regra de Ouro": Server Actions só
 * existem para mutations disparadas pelo client; leitura de página é
 * responsabilidade do próprio Server Component). `markReadAction` (mutation)
 * continua sendo uma Server Action, chamada pelo `AlertsList` no clique.
 */
export default function AlertsPage({ searchParams }: AlertsPageProps) {
  return (
    <Suspense fallback={<AlertsPageSkeleton />}>
      <AlertsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AlertsContent({ searchParams }: AlertsPageProps) {
  const { type: typeParam, status: statusParam } = await searchParams;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return <p className="text-sm text-muted-foreground">Sessão inválida.</p>;
  }

  const type = ALERT_TYPE_VALUES.has(typeParam ?? "") ? (typeParam as AlertType) : undefined;
  const status: StatusFilterValue = STATUS_FILTER_VALUES.has(statusParam ?? "")
    ? (statusParam as StatusFilterValue)
    : "all";

  const settings = await settingsService.getSettingsForClient(userId);

  // Query já filtra por `unreadOnly` quando o status é "Não lido" (usa o
  // filtro nativo do repository). "Lido" não tem filtro nativo equivalente
  // (repository só expõe `unreadOnly`) — busca tudo do tipo e filtra aqui,
  // sem precisar tocar em `modules/` (fora do escopo desta tarefa).
  let alerts = await alertService.listAlerts(userId, {
    type,
    unreadOnly: status === "unread" ? true : undefined,
  });

  if (status === "read") {
    alerts = alerts.filter((alert) => alert.readAt !== null);
  }

  const hasActiveFilters = Boolean(type) || status !== "all";
  const emptyTitle = hasActiveFilters
    ? "Nenhum alerta no histórico."
    : "Nenhum alerta novo esta semana. Continue assim!";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5 rounded-lg bg-secondary/60 p-3 text-[13px] font-medium text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-bold text-on-warning">Atenção</span> quando o gasto da semana numa
          categoria passa de {settings.alertAnomalyMultiplier}x a média e é maior que{" "}
          {formatBRL(settings.alertMinimumAmount)}.{" "}
          <span className="font-bold text-on-success">Economia</span> quando o gasto fica abaixo de{" "}
          {settings.alertGreenMultiplier}x a média.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-9 w-full max-w-md" />}>
        <AlertFilters />
      </Suspense>

      {alerts.length === 0 ? (
        <EmptyState icon={Inbox} title={emptyTitle} />
      ) : (
        <AlertsList
          key={`${type ?? "all"}-${status}`}
          alerts={alerts}
          statusFilter={status}
          emptyTitle="Nenhum alerta no histórico."
        />
      )}
    </div>
  );
}

function AlertsPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
