import { toZonedTime } from "date-fns-tz";
import { Prisma, type Asset } from "@/generated/prisma/client";
import { TIMEZONE, parseInSaoPaulo } from "@/lib/date/timezone";
import { assetRepository } from "./repository";
import { AssetNotFoundError } from "./errors";
import type { CreateAssetInput, UpdateAssetInput } from "./schemas";
import type { AssetEvolutionPoint, TotalEvolutionPoint } from "./types";

async function createAsset(userId: string, input: CreateAssetInput): Promise<Asset> {
  return assetRepository.create(userId, input);
}

async function updateAsset(userId: string, id: string, input: UpdateAssetInput): Promise<Asset> {
  const updated = await assetRepository.update(userId, id, input);
  if (!updated) throw new AssetNotFoundError(id);
  return updated;
}

/** Soft delete (mesmo padrão de accounts/transactions — nunca remove fisicamente). */
async function deleteAsset(userId: string, id: string): Promise<void> {
  const deleted = await assetRepository.softDelete(userId, id);
  if (!deleted) throw new AssetNotFoundError(id);
}

async function list(userId: string): Promise<Asset[]> {
  return assetRepository.list(userId);
}

/** Série de `AssetSnapshot` de UM asset — base do gráfico de evolução individual (docs/27-ASSETS.md). */
async function evolution(userId: string, assetId: string): Promise<AssetEvolutionPoint[]> {
  const asset = await assetRepository.findById(userId, assetId);
  if (!asset) throw new AssetNotFoundError(assetId);

  const snapshots = await assetRepository.listSnapshots(assetId);
  return snapshots.map((snapshot) => ({ date: snapshot.date, value: snapshot.value }));
}

/** Soma de `currentValue` de todos os assets ativos — patrimônio total (docs/27-ASSETS.md). */
async function totalPatrimony(userId: string): Promise<Prisma.Decimal> {
  return assetRepository.sumCurrentValues(userId);
}

/** Chave de dia-calendário em America/Sao_Paulo (`YYYY-MM-DD`) — bucket da agregação abaixo. */
function dayKeySP(date: Date): string {
  const zoned = toZonedTime(date, TIMEZONE);
  return `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, "0")}-${String(zoned.getDate()).padStart(2, "0")}`;
}

/** Meia-noite (America/Sao_Paulo) do dia calendário de `date`, convertida pro instante UTC correto. */
function startOfDaySP(date: Date): Date {
  const zoned = toZonedTime(date, TIMEZONE);
  return parseInSaoPaulo(new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, 0, 0));
}

/** Um evento de valor de UM asset numa data — compra (âncora inicial) ou snapshot. */
type EvolutionEvent = { assetId: string; value: Prisma.Decimal; date: Date };

/**
 * Constrói a série de evolução do patrimônio TOTAL a partir de dois tipos de
 * evento por asset (docs/27-ASSETS.md, "Evolução"):
 * - a COMPRA (`purchaseDate` + `purchaseValue`) — asset entra na soma a
 *   partir daqui, nunca antes. Sem essa âncora, um asset com um único
 *   snapshot (o valor atual) "nasce" no gráfico já nesse valor e esconde a
 *   valorização real desde a compra (ex.: imóvel comprado em 2020 por
 *   R$186k, hoje valendo R$320k, mas só com o snapshot do valor atual).
 * - cada `AssetSnapshot` — atualização de valor registrada pelo usuário.
 *
 * Abordagem (step function — YAGNI, sem tabela de agregação dedicada):
 * 1. Cada evento é bucketizado por dia-calendário em America/Sao_Paulo. Se
 *    um asset tiver >1 evento no mesmo dia (ex.: compra e 1º snapshot no
 *    mesmo dia), fica o último processado — `events` chega ordenado por
 *    data asc com a compra antes do snapshot em caso de empate (ver
 *    `evolutionTotal`), então o snapshot (mais preciso) grava por cima.
 * 2. Os dias-âncora da série são a união de todos os dias em que QUALQUER
 *    asset teve um evento novo (compra ou snapshot).
 * 3. Em cada dia-âncora, o valor de cada asset é "carregado" (forward-fill)
 *    do evento mais recente já conhecido até aquele dia — um asset cuja
 *    `purchaseDate` ainda não chegou não entra na soma (valor 0 implícito).
 * 4. O total do dia é a soma dos valores carregados de todos os assets.
 *
 * Não é recalculado a partir de Transactions — é histórico real do que foi
 * informado (compra + atualizações), igual à evolução de um asset isolado.
 */
function buildTotalEvolution(events: EvolutionEvent[]): TotalEvolutionPoint[] {
  if (events.length === 0) return [];

  const lastValueByAssetPerDay = new Map<string, Map<string, Prisma.Decimal>>();
  const dayDateByKey = new Map<string, Date>();

  for (const event of events) {
    const key = dayKeySP(event.date);
    if (!lastValueByAssetPerDay.has(key)) {
      lastValueByAssetPerDay.set(key, new Map());
      dayDateByKey.set(key, startOfDaySP(event.date));
    }
    lastValueByAssetPerDay.get(key)!.set(event.assetId, event.value);
  }

  const sortedDayKeys = Array.from(dayDateByKey.keys()).sort();
  const runningValueByAsset = new Map<string, Prisma.Decimal>();

  return sortedDayKeys.map((dayKey) => {
    const dayValues = lastValueByAssetPerDay.get(dayKey)!;
    for (const [assetId, value] of dayValues) {
      runningValueByAsset.set(assetId, value);
    }

    const total = Array.from(runningValueByAsset.values()).reduce(
      (sum, value) => sum.plus(value),
      new Prisma.Decimal(0),
    );

    return { date: dayDateByKey.get(dayKey)!, total };
  });
}

/**
 * Série temporal do patrimônio total — ver `buildTotalEvolution` para a
 * abordagem de agregação. Combina a compra de cada asset (âncora inicial)
 * com os snapshots, ordenados por data (compra antes de snapshot em caso de
 * empate no mesmo dia — `Array.prototype.sort` é estável).
 */
async function evolutionTotal(userId: string): Promise<TotalEvolutionPoint[]> {
  const [purchaseAnchors, snapshots] = await Promise.all([
    assetRepository.listPurchaseAnchors(userId),
    assetRepository.listAllSnapshotsForUser(userId),
  ]);

  const purchaseEvents: EvolutionEvent[] = purchaseAnchors.map((asset) => ({
    assetId: asset.id,
    value: asset.purchaseValue,
    date: asset.purchaseDate,
  }));

  const events = [...purchaseEvents, ...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());

  return buildTotalEvolution(events);
}

export const assetService = {
  createAsset,
  updateAsset,
  deleteAsset,
  list,
  evolution,
  totalPatrimony,
  evolutionTotal,
};
