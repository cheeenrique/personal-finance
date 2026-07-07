"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TruncatedTextProps = {
  text: string;
  className?: string;
};

/**
 * Texto truncado em uma linha (reticências) com `Tooltip` mostrando o valor
 * completo no hover/foco — usado na coluna Descrição das tabelas (Transações,
 * itens de fatura, histórico de conta, preview do Dashboard) pra descrições
 * longas (ex.: Pix com dados bancários) não estourarem a largura da tabela e
 * forçarem scroll lateral (docs/04-DESIGN_SYSTEM.md, "Tabelas"). O Tooltip só
 * é montado quando o texto realmente truncou (`scrollWidth > clientWidth`);
 * texto curto renderiza como `<span>` puro, sem trigger de hover à toa.
 */
export function TruncatedText({ text, className }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    function measure() {
      if (node) setIsTruncated(node.scrollWidth > node.clientWidth);
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  const span = (
    // `min-w-0`: dentro de um flex row (uso comum aqui, descrição + badges
    // inline), um flex item não encolhe abaixo do próprio min-content por
    // padrão — sem isso o `truncate` nunca dispara.
    <span ref={ref} className={cn("block min-w-0 truncate", className)}>
      {text}
    </span>
  );

  if (!isTruncated) return span;

  return (
    <Tooltip>
      <TooltipTrigger render={span} />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
