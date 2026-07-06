import { prisma } from "@/lib/db/client";
import { Prisma, type Asset, type AssetSnapshot } from "@/generated/prisma/client";
import type { AssetType } from "@/generated/prisma/enums";
import { nowInSaoPaulo } from "@/lib/date/timezone";

export type CreateAssetData = {
  name: string;
  type: AssetType;
  purchaseValue: string;
  currentValue: string;
  purchaseDate: Date;
  notes?: string | null;
};

export type UpdateAssetData = Partial<CreateAssetData>;

/**
 * Acesso a dados do módulo assets. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

async function findById(userId: string, id: string): Promise<Asset | null> {
  return prisma.asset.findFirst({ where: { id, userId, deletedAt: null } });
}

async function list(userId: string): Promise<Asset[]> {
  return prisma.asset.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

async function create(userId: string, data: CreateAssetData): Promise<Asset> {
  return prisma.asset.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      purchaseValue: data.purchaseValue,
      currentValue: data.currentValue,
      purchaseDate: data.purchaseDate,
      notes: data.notes ?? null,
    },
  });
}

/**
 * Update escopado (ownership via `findById` antes de escrever, mesmo padrão
 * de `modules/accounts/repository.ts`). Quando `currentValue` é enviado,
 * grava o novo valor + um `AssetSnapshot(assetId, value, date=agora em SP)`
 * atomicamente no mesmo `$transaction` — regra central do módulo
 * (docs/27-ASSETS.md, "Toda atualização de currentValue grava um
 * AssetSnapshot"). Demais campos não disparam snapshot.
 */
async function update(userId: string, id: string, data: UpdateAssetData): Promise<Asset | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  const fields = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.purchaseValue !== undefined && { purchaseValue: data.purchaseValue }),
    ...(data.purchaseDate !== undefined && { purchaseDate: data.purchaseDate }),
    ...(data.notes !== undefined && { notes: data.notes }),
  };

  if (data.currentValue === undefined) {
    return prisma.asset.update({ where: { id }, data: fields });
  }

  const snapshotDate = nowInSaoPaulo();

  const [updated] = await prisma.$transaction([
    prisma.asset.update({ where: { id }, data: { ...fields, currentValue: data.currentValue } }),
    prisma.assetSnapshot.create({
      data: { assetId: id, value: data.currentValue, date: snapshotDate },
    }),
  ]);

  return updated;
}

/** Soft delete — nunca remove fisicamente (mesmo padrão de accounts/transactions). */
async function softDelete(userId: string, id: string): Promise<Asset | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** Série de `AssetSnapshot` de UM asset, ordenada por data — base do gráfico de evolução (docs/27-ASSETS.md). */
async function listSnapshots(assetId: string): Promise<AssetSnapshot[]> {
  return prisma.assetSnapshot.findMany({
    where: { assetId },
    orderBy: { date: "asc" },
  });
}

/** Soma de `currentValue` de todos os assets ativos do usuário — patrimônio total (docs/27-ASSETS.md). */
async function sumCurrentValues(userId: string): Promise<Prisma.Decimal> {
  const result = await prisma.asset.aggregate({
    where: { userId, deletedAt: null },
    _sum: { currentValue: true },
  });

  return result._sum.currentValue ?? new Prisma.Decimal(0);
}

/**
 * Todos os snapshots de todos os assets ATIVOS do usuário, ordenados por
 * data — insumo bruto de `service.ts` `evolutionTotal` (agregação por data
 * acontece em memória, ver comentário lá).
 */
async function listAllSnapshotsForUser(
  userId: string,
): Promise<Array<Pick<AssetSnapshot, "assetId" | "value" | "date">>> {
  return prisma.assetSnapshot.findMany({
    where: { asset: { userId, deletedAt: null } },
    select: { assetId: true, value: true, date: true },
    orderBy: { date: "asc" },
  });
}

export const assetRepository = {
  findById,
  list,
  create,
  update,
  softDelete,
  listSnapshots,
  sumCurrentValues,
  listAllSnapshotsForUser,
};
