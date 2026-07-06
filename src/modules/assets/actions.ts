"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { assetService } from "./service";
import { createAssetSchema, updateAssetSchema } from "./schemas";
import { AssetDomainError } from "./errors";
import type { ActionResult, Asset, AssetEvolutionPoint, TotalEvolutionPoint } from "./types";

const ASSETS_PATH = "/assets";
const DASHBOARD_PATH = "/dashboard";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof AssetDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/assets] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateAssetRoutes(): void {
  revalidatePath(ASSETS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createAssetAction(input: unknown): Promise<ActionResult<Asset>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createAssetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const asset = await assetService.createAsset(userId, parsed.data);
    revalidateAssetRoutes();
    return { success: true, data: asset };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAssetAction(id: string, input: unknown): Promise<ActionResult<Asset>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateAssetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const asset = await assetService.updateAsset(userId, id, parsed.data);
    revalidateAssetRoutes();
    return { success: true, data: asset };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteAssetAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await assetService.deleteAsset(userId, id);
    revalidateAssetRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listAssetsAction(): Promise<ActionResult<Asset[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const assets = await assetService.list(userId);
    return { success: true, data: assets };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getEvolutionAction(assetId: string): Promise<ActionResult<AssetEvolutionPoint[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const evolution = await assetService.evolution(userId, assetId);
    return { success: true, data: evolution };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getTotalPatrimonyAction(): Promise<ActionResult<string>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const total = await assetService.totalPatrimony(userId);
    return { success: true, data: total.toString() };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getEvolutionTotalAction(): Promise<ActionResult<TotalEvolutionPoint[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const evolution = await assetService.evolutionTotal(userId);
    return { success: true, data: evolution };
  } catch (error) {
    return toActionError(error);
  }
}
