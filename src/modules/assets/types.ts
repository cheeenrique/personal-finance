import type { Asset, AssetSnapshot, Prisma } from "@/generated/prisma/client";
import type { AssetType } from "@/generated/prisma/enums";

export type { Asset, AssetSnapshot, AssetType };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Ponto da série de evolução de UM asset — base do gráfico de histórico (docs/27-ASSETS.md). */
export type AssetEvolutionPoint = {
  date: Date;
  value: Money;
};

/** Ponto da série de evolução do PATRIMÔNIO TOTAL — soma de todos os assets ativos numa data. */
export type TotalEvolutionPoint = {
  date: Date;
  total: Money;
};
