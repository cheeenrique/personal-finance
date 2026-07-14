import type { LucideIcon } from "lucide-react";
import { Lock, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { CardStatus } from "@/generated/prisma/enums";

type CardStatusToken = "warning" | "danger";

export type CardStatusMeta = {
  token: CardStatusToken;
  label: string;
  icon: LucideIcon;
  /** Aplicado no wrapper da `CardFace` (grid, hero do detalhe) — cartão "desligado" visualmente, sem cor nova (fonte visual: `Personal Finance - Cartoes.dc.html`, `STATUS.filter`). */
  faceFilterClass: string;
};

/** `ACTIVE` não entra aqui — segue idêntico ao visual de hoje (sem estampa/pill/filter). */
const CARD_STATUS_META: Partial<Record<CardStatus, CardStatusMeta>> = {
  [CardStatus.BLOCKED]: {
    token: "warning",
    label: "Bloqueado",
    icon: Lock,
    faceFilterClass: "grayscale-[50%] opacity-[0.72]",
  },
  [CardStatus.CANCELLED]: {
    token: "danger",
    label: "Cancelado",
    icon: XCircle,
    faceFilterClass: "grayscale opacity-[0.46]",
  },
};

/** `null` para `ACTIVE` — callers usam isso pra decidir se renderizam estampa/pill/filter. */
export function getCardStatusMeta(status: CardStatus): CardStatusMeta | null {
  return CARD_STATUS_META[status] ?? null;
}

const STAMP_TOKEN_CLASSES: Record<CardStatusToken, string> = {
  warning: "border-warning text-on-warning",
  danger: "border-destructive text-on-danger",
};

const PILL_TOKEN_CLASSES: Record<CardStatusToken, string> = {
  warning: "bg-warning/16 text-on-warning",
  danger: "bg-destructive/16 text-on-danger",
};

/**
 * Carimbo overlay sobre a face do cartão (grid + hero do detalhe) — só
 * quando `status !== ACTIVE`. Puramente decorativo (`aria-hidden`): a mesma
 * informação já existe como texto real no `CardStatusPill` ao lado/abaixo
 * (mesma lógica de `CardFace`, "toda a arte é decorativa, quem descreve pro
 * leitor de tela é o texto ao redor"). `pointer-events-none` — nunca
 * intercepta o clique que abre o detalhe do cartão.
 */
export function CardStatusStamp({ meta }: { meta: CardStatusMeta }) {
  const Icon = meta.icon;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span
        className={cn(
          "inline-flex -rotate-6 items-center gap-2 rounded-[11px] border-2 bg-[color-mix(in_srgb,var(--background)_62%,transparent)] px-4 py-2.5 text-[13px] font-black tracking-[0.08em] uppercase shadow-[0_8px_22px_rgba(0,0,0,0.45)] backdrop-blur-[2px]",
          STAMP_TOKEN_CLASSES[meta.token],
        )}
      >
        <Icon className="size-[15px]" aria-hidden="true" />
        {meta.label}
      </span>
    </div>
  );
}

/**
 * Pill de status no meta do card (topo, grid) e nos banners do detalhe —
 * repete o estado em texto real (acessível), sem depender só da cor da face
 * (docs da tarefa: "cor + ícone + texto").
 */
export function CardStatusPill({ meta, className }: { meta: CardStatusMeta; className?: string }) {
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
        PILL_TOKEN_CLASSES[meta.token],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
