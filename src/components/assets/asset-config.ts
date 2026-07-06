import { Building2, Car, Landmark, Package, ShieldCheck, TrendingUp, type LucideIcon } from "lucide-react";

import { AssetType } from "@/generated/prisma/enums";

/** Rótulo singular por tipo — usado no Select do formulário e no subtítulo do card (docs/27-ASSETS.md, "Tipos de Asset"). */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  [AssetType.PROPERTY]: "Imóvel",
  [AssetType.VEHICLE]: "Veículo",
  [AssetType.INVESTMENT]: "Investimento",
  [AssetType.FGTS]: "FGTS",
  [AssetType.EMERGENCY_FUND]: "Reserva de emergência",
  [AssetType.OTHER]: "Outro",
};

/** Rótulo plural — cabeçalho de cada grupo na listagem e legenda do donut (docs/27-ASSETS.md, "Lista de Assets"). */
export const ASSET_TYPE_GROUP_LABELS: Record<AssetType, string> = {
  [AssetType.PROPERTY]: "Imóveis",
  [AssetType.VEHICLE]: "Veículos",
  [AssetType.INVESTMENT]: "Investimentos",
  [AssetType.FGTS]: "FGTS",
  [AssetType.EMERGENCY_FUND]: "Reserva de emergência",
  [AssetType.OTHER]: "Outros",
};

export const ASSET_TYPE_OPTIONS = Object.values(AssetType).map((type) => ({
  value: type,
  label: ASSET_TYPE_LABELS[type],
}));

/** Ordem fixa de exibição dos grupos — segue a ordem do handoff ("Imóveis, Veículos, Investimentos, Reserva, Outros"), com FGTS entre Investimentos e Reserva. */
export const ASSET_TYPE_GROUP_ORDER: AssetType[] = [
  AssetType.PROPERTY,
  AssetType.VEHICLE,
  AssetType.INVESTMENT,
  AssetType.FGTS,
  AssetType.EMERGENCY_FUND,
  AssetType.OTHER,
];

export const ASSET_TYPE_ICONS: Record<AssetType, LucideIcon> = {
  [AssetType.PROPERTY]: Building2,
  [AssetType.VEHICLE]: Car,
  [AssetType.INVESTMENT]: TrendingUp,
  [AssetType.FGTS]: Landmark,
  [AssetType.EMERGENCY_FUND]: ShieldCheck,
  [AssetType.OTHER]: Package,
};

/** Classes Tailwind (ícone tint) por tipo — mesmo padrão do `KPICard` (`TONE_CLASSES`), sem cor customizável por item (Asset não tem campo `color`). */
export const ASSET_TYPE_TONE_CLASSES: Record<AssetType, string> = {
  [AssetType.PROPERTY]: "bg-asset/16 text-on-asset",
  [AssetType.VEHICLE]: "bg-primary/16 text-primary",
  [AssetType.INVESTMENT]: "bg-success/16 text-success",
  [AssetType.FGTS]: "bg-warning/16 text-warning",
  [AssetType.EMERGENCY_FUND]: "bg-transfer/16 text-on-transfer",
  [AssetType.OTHER]: "bg-accent/16 text-accent",
};

/** Cor sólida (CSS var) por tipo — usada como `fill` das fatias do donut de composição, ecoando as classes acima. */
export const ASSET_TYPE_CHART_COLORS: Record<AssetType, string> = {
  [AssetType.PROPERTY]: "var(--asset)",
  [AssetType.VEHICLE]: "var(--primary)",
  [AssetType.INVESTMENT]: "var(--success)",
  [AssetType.FGTS]: "var(--warning)",
  [AssetType.EMERGENCY_FUND]: "var(--transfer)",
  [AssetType.OTHER]: "var(--accent)",
};

export type AssetVariation = {
  /** `+12,3%` / `-4,0%` — variação percentual valor de compra → valor atual. */
  label: string;
  direction: "up" | "down";
  positive: boolean;
};

/**
 * Variação percentual entre `purchaseValue` e `currentValue` (docs/27-ASSETS.md,
 * "Card de Asset" + "Detalhe do Asset" > "comparação compra vs atual").
 * `purchaseValue` é sempre positivo (`positiveDecimalSchema`), então a
 * divisão abaixo nunca é por zero.
 */
export function computeAssetVariation(purchaseValue: string, currentValue: string): AssetVariation {
  const purchase = Number(purchaseValue);
  const current = Number(currentValue);
  const percent = ((current - purchase) / purchase) * 100;
  const positive = current >= purchase;

  return {
    label: `${positive ? "+" : ""}${percent.toFixed(1)}%`,
    direction: positive ? "up" : "down",
    positive,
  };
}
