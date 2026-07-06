import type { AssetType } from "@/generated/prisma/enums";

/**
 * Forma serializável de `Asset` (@/modules/assets/types) para cruzar a
 * fronteira Server → Client Component. `Prisma.Decimal` não é serializável
 * por RSC — o Server Component converte pra string na borda antes de passar
 * adiante (docs/03-DATABASE.md: "Parse/format só na borda"), mesmo padrão de
 * `components/accounts/types.ts`.
 */
export type AssetCardData = {
  id: string;
  name: string;
  type: AssetType;
  /** Decimal(12,2) como string — nunca float. */
  purchaseValue: string;
  currentValue: string;
  purchaseDate: Date;
  notes: string | null;
};

/** Ponto de uma série de evolução (patrimônio total ou de um asset isolado) já pronto pro chart. */
export type EvolutionChartPoint = {
  label: string;
  value: number;
};
