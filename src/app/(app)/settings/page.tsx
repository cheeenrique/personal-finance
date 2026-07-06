import { auth } from "@/lib/auth";
import { settingsService } from "@/modules/settings/service";
import { ProfileCard } from "@/components/settings/profile-card";
import { PreferencesCard } from "@/components/settings/preferences-card";
import { AlertsCard } from "@/components/settings/alerts-card";
import { TelegramCard } from "@/components/settings/telegram-card";
import { DataCard } from "@/components/settings/data-card";
import { SessionCard } from "@/components/settings/session-card";

/**
 * `/settings` (docs/12-SETTINGS.md). Server Component: lê `UserSettings`
 * direto do service, sem passar por Server Action — mesma convenção de
 * `/accounts` (Server Actions aqui só existem para mutations disparadas
 * pelo client, docs/99-CLAUDE.md "Regra de Ouro"). `Prisma.Decimal` vira
 * string na borda antes de descer pros Client Components (RSC não
 * serializa instância de classe).
 *
 * Telegram: vínculo é 100% DB-backed agora (`UserSettings.telegramChatId`,
 * self-service via código — ver `telegram-card.tsx`). O fallback env
 * (`TELEGRAM_ALLOWED_CHAT_IDS`, legado) só é resolvido no webhook
 * (`modules/telegram/allowlist.ts`), nunca lido aqui — setups legados via
 * env aparecem como "não vinculado" nesta tela até o usuário gerar um código
 * e confirmar pelo bot.
 */
export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const settings = await settingsService.getSettings(userId);
  const pendingCode = settingsService.activeTelegramLinkCode(settings);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProfileCard name={session.user?.name ?? "Usuário"} email={session.user?.email ?? ""} />

        <PreferencesCard currency={settings.currency} timezone={settings.timezone} />

        <AlertsCard
          alertAnomalyMultiplier={settings.alertAnomalyMultiplier.toString()}
          alertMinimumAmount={settings.alertMinimumAmount.toString()}
          alertGreenMultiplier={settings.alertGreenMultiplier.toString()}
        />

        <TelegramCard chatId={settings.telegramChatId} pendingCode={pendingCode} />
      </div>

      <DataCard />
      <SessionCard />
    </div>
  );
}
