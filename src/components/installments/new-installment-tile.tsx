"use client";

import { Plus } from "lucide-react";

/** Tile "+ Novo parcelamento" — empty state dashed, sempre o último item da grid (docs/06-SCREENS.md, padrão de `/cards`/`/accounts`). */
export function NewInstallmentTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      <span className="flex size-10 items-center justify-center rounded-[11px] bg-accent/16">
        <Plus className="size-5 text-accent" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold">Novo parcelamento</span>
    </button>
  );
}
