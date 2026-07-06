import { prisma } from "@/lib/db/client";
import type { UserSettings } from "@/generated/prisma/client";
import { Theme } from "@/generated/prisma/enums";
import { TIMEZONE } from "@/lib/date/timezone";

export type UpdateSettingsData = {
  currency?: string;
  timezone?: string;
  theme?: Theme;
  alertAnomalyMultiplier?: string;
  alertMinimumAmount?: string;
  alertGreenMultiplier?: string;
};

/** Defaults idênticos ao seed (prisma/seed.ts `upsertUserSettings`) — mantidos em sincronia (docs/12-SETTINGS.md, "Regra 1"). */
const DEFAULT_SETTINGS = {
  currency: "BRL",
  timezone: TIMEZONE,
  theme: Theme.DARK,
  alertAnomalyMultiplier: "1.5",
  alertMinimumAmount: "50.00",
  alertGreenMultiplier: "0.6",
} as const;

async function findByUserId(userId: string): Promise<UserSettings | null> {
  return prisma.userSettings.findUnique({ where: { userId } });
}

/**
 * Idempotente via `upsert` na unique constraint `userId` — cobre tanto o
 * usuário que nunca acessou `/settings` quanto uma possível corrida entre
 * requests concorrentes no primeiro acesso, sem duplicar (docs/12-SETTINGS.md,
 * "Regra 1": criado automaticamente no primeiro acesso, com os defaults).
 */
async function findOrCreate(userId: string): Promise<UserSettings> {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId, ...DEFAULT_SETTINGS },
  });
}

async function update(userId: string, data: UpdateSettingsData): Promise<UserSettings> {
  return prisma.userSettings.update({
    where: { userId },
    data: {
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
      ...(data.theme !== undefined && { theme: data.theme }),
      ...(data.alertAnomalyMultiplier !== undefined && { alertAnomalyMultiplier: data.alertAnomalyMultiplier }),
      ...(data.alertMinimumAmount !== undefined && { alertMinimumAmount: data.alertMinimumAmount }),
      ...(data.alertGreenMultiplier !== undefined && { alertGreenMultiplier: data.alertGreenMultiplier }),
    },
  });
}

export const settingsRepository = { findByUserId, findOrCreate, update };
