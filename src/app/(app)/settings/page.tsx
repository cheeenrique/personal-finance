import { auth } from "@/lib/auth";
import { settingsService } from "@/modules/settings/service";
import { findUserById } from "@/modules/auth/repository";
import { merchantRuleService } from "@/modules/merchant-rules/service";
import { categoryService } from "@/modules/categories/service";
import { ProfileCard } from "@/components/settings/profile-card";
import { PreferencesCard } from "@/components/settings/preferences-card";
import { AlertsCard } from "@/components/settings/alerts-card";
import { TelegramCard } from "@/components/settings/telegram-card";
import { MerchantRulesCard } from "@/components/settings/merchant-rules-card";
import { DataCard } from "@/components/settings/data-card";
import { SessionCard } from "@/components/settings/session-card";

/**
 * `/settings` (docs/12-SETTINGS.md). Server Component: lê `UserSettings`
 * direto do service, sem passar por Server Action — mesma convenção de
 * `/accounts` (Server Actions aqui só existem para mutations disparadas
 * pelo client, docs/99-CLAUDE.md "Regra de Ouro"). Usa
 * `getSettingsForClient` (não `getSettings`) — já devolve
 * `ClientUserSettings` (3 campos `Decimal` de threshold já em `string`), a
 * mesma conversão que `getSettingsAction`/`updateSettingsAction` aplicam
 * antes de cruzar a fronteira Server → Client (ver `modules/settings/service.ts`
 * `toClientUserSettings`) — evita repetir `.toString()` aqui.
 *
 * Telegram: modelo "traga seu próprio bot" (docs/30-TELEGRAM.md) — cada
 * usuário instala o próprio bot (token colado na UI, `hasBot`) e depois
 * vincula o chat (`telegramChatId`, self-service via código). Nenhum secret
 * (`telegramBotToken`/`telegramWebhookSecret`) chega aqui — `getSettingsForClient`
 * já devolve só os campos seguros de exibição (ver `modules/settings/service.ts`
 * `toClientUserSettings`).
 *
 * `memberSince` (card de Perfil): a sessão do NextAuth só expõe id/name/email
 * (`10-AUTH.md`), então `User.createdAt` é buscado à parte via
 * `modules/auth/repository` — mesmo ponto único de acesso ao Prisma que o
 * módulo de auth já usa para login.
 *
 * Regras de categoria (`MerchantRulesCard`, docs/superpowers/specs/
 * 2026-07-08-telegram-recibo-categoria-refino-design.md): `merchantRuleService.listRules`
 * e `categoryService.listTree` seguem a mesma convenção acima (leitura direto
 * do service, sem Server Action) — mutations (criar/excluir regra) usam as
 * Server Actions do módulo, disparadas pelo client.
 */
export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [settings, user, merchantRules, categoryTree] = await Promise.all([
    settingsService.getSettingsForClient(userId),
    findUserById(userId),
    merchantRuleService.listRules(userId),
    categoryService.listTree(userId),
  ]);
  if (!user) return null;

  const pendingCode = settingsService.activeTelegramLinkCode(settings);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProfileCard
          name={session.user?.name ?? "Usuário"}
          email={session.user?.email ?? ""}
          memberSince={user.createdAt}
        />

        <PreferencesCard currency={settings.currency} timezone={settings.timezone} />

        <AlertsCard
          alertAnomalyMultiplier={settings.alertAnomalyMultiplier}
          alertMinimumAmount={settings.alertMinimumAmount}
          alertGreenMultiplier={settings.alertGreenMultiplier}
        />

        <TelegramCard
          hasBot={settings.hasBot}
          botUsername={settings.telegramBotUsername}
          webhookRegistered={settings.telegramWebhookRegistered}
          chatId={settings.telegramChatId}
          pendingCode={pendingCode}
        />
      </div>

      <MerchantRulesCard initialRules={merchantRules} categoryTree={categoryTree} />

      <DataCard />
      <SessionCard />
    </div>
  );
}
