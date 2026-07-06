import type { UserSettings } from "@/generated/prisma/client";
import { settingsRepository, type UpdateSettingsData } from "./repository";

/** Lazy-create idempotente — garante UserSettings mesmo se o seed não rodou pra esse usuário (docs/12-SETTINGS.md, "Regra 1"). */
async function getSettings(userId: string): Promise<UserSettings> {
  return settingsRepository.findOrCreate(userId);
}

async function updateSettings(userId: string, input: UpdateSettingsData): Promise<UserSettings> {
  // Garante que a linha existe antes de atualizar (usuário pode nunca ter acessado /settings).
  const current = await settingsRepository.findOrCreate(userId);

  const hasChanges = Object.values(input).some((value) => value !== undefined);
  if (!hasChanges) return current;

  return settingsRepository.update(userId, input);
}

export const settingsService = { getSettings, updateSettings };
