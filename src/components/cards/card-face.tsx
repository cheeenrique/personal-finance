import { Nfc } from "lucide-react";

import { cn } from "@/lib/utils";
import { CardType } from "@/generated/prisma/enums";
import { BrandMark } from "./brand-mark";

type CardFaceProps = {
  /** String CSS de `cardGradient` (`card-color.ts`) — 135°, cor→versão escura. */
  gradient: string;
  cardName: string;
  brand: string | null;
  /** Só os 4 últimos dígitos (`CardSummaryView.lastFour`) — NUNCA o número completo do cartão. */
  lastFour: string | null;
  holder: string | null;
  type: CardType;
  className?: string;
};

const TYPE_LABEL: Record<CardType, string> = {
  [CardType.CREDIT]: "Crédito",
  [CardType.MEAL]: "Alimentação",
};

/**
 * Chip dourado decorativo — literal fixo (não faz parte da paleta de cor do
 * cartão, é o metal do chip físico em todo cartão real).
 */
function ChipIcon({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      style={{ background: "linear-gradient(135deg, #f6dfa1, #c99a4a)" }}
      className={cn("grid grid-cols-3 grid-rows-2 gap-px rounded-[4px] p-[3px]", className)}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="rounded-[1px] bg-black/25" />
      ))}
    </div>
  );
}

/**
 * Face de cartão realista e reutilizável — fonte visual:
 * `Personal Finance - Cartoes.dc.html` (`dc-import name="CardFace"`, grid +
 * detalhe + preview ao vivo do form). Puramente apresentacional: recebe os
 * dados já resolvidos, nunca busca nada nem guarda estado próprio — é por
 * isso que o preview do form consegue "ligar" direto no `useState` do
 * formulário e atualizar a cada tecla sem nenhuma ponte extra. Toda a arte é
 * decorativa (`aria-hidden`); quem descreve o cartão pra leitor de tela é o
 * texto ao redor (nome do card na listagem, `brand · final XXXX` no
 * detalhe). NUNCA renderiza o número completo — só os 4 últimos dígitos
 * mascarados atrás de `••••` (mesma regra de `types.ts`, `lastFour`).
 */
export function CardFace({ gradient, cardName, brand, lastFour, holder, type, className }: CardFaceProps) {
  const holderLabel = (holder || cardName || "SEU NOME").toUpperCase();

  return (
    <div
      aria-hidden="true"
      style={{ background: gradient }}
      className={cn(
        "relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-xl p-4 text-white shadow-[0_10px_28px_rgba(0,0,0,0.4)] select-none sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold sm:text-[15px]">{cardName || "Novo cartão"}</p>
          <p className="mt-0.5 text-[9.5px] font-bold tracking-[0.14em] text-white/70 uppercase sm:text-[10px]">
            {TYPE_LABEL[type]}
          </p>
        </div>
        <Nfc className="size-5 shrink-0 text-white/75 sm:size-6" strokeWidth={1.8} />
      </div>

      <div className="flex flex-col gap-2.5">
        <ChipIcon className="h-6 w-8 sm:h-7 sm:w-9" />
        <p className="font-mono text-[13.5px] font-medium tracking-[0.1em] text-white/95 sm:text-base">
          {lastFour ? `•••• •••• •••• ${lastFour}` : "•••• •••• •••• ••••"}
        </p>
      </div>

      <div className="flex items-end justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-[8.5px] font-bold tracking-[0.12em] text-white/55 uppercase sm:text-[9px]">
            Titular
          </p>
          <p className="mt-0.5 truncate text-[10.5px] font-semibold sm:text-xs">{holderLabel}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[8.5px] font-bold tracking-[0.12em] text-white/55 uppercase sm:text-[9px]">
            Validade
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] font-semibold sm:text-xs">••/••</p>
        </div>
        <BrandMark brand={brand} className="ml-1 shrink-0" />
      </div>
    </div>
  );
}
