"use client";

import { Plus } from "lucide-react";

/**
 * Tile "+ Novo Cartão" — empty state tracejado, sempre o último item da grid
 * (docs/06-SCREENS.md, padrão de `/accounts`). `h-full` + `min-h` generoso:
 * a grid agora empilha face realista + card de meta (`CardTile`), bem mais
 * alto que o tile plano antigo — sem isso este tile ficaria baixo e
 * desalinhado ao lado dos demais na mesma linha.
 */
export function NewCardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      <span className="flex size-10 items-center justify-center rounded-[11px] bg-accent/16">
        <Plus className="size-5 text-accent" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold">Novo Cartão</span>
    </button>
  );
}
