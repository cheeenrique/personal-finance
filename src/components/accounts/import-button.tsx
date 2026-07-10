"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportModal } from "./import-modal";

type ImportButtonProps = { accountId: string };

const NEUTRAL_FORMATS = ["OFX", "CSV", "XLS"];

/**
 * CTA de importação de extrato (docs/03-DATABASE.md, "Importação de Extrato
 * OFX"; handoff "Conta (Detalhe)", cabeçalho) — `accent` (ação que move
 * dinheiro pra dentro da conta, docs/04-DESIGN_SYSTEM.md "Accent"), ao lado
 * de "Transferir" (outline, `AccountHeaderActions`). Card-CTA (ícone +
 * título + formatos aceitos) em vez do botão cinza simples anterior
 * (`variant="neutral"`) — PDF em pílula sólida branca porque é o único
 * formato que passa por extração via IA (mais lento, aviso próprio dentro do
 * modal enquanto processa).
 */
export function ImportButton({ accountId }: ImportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="accent"
        size="xl"
        className="h-auto flex-col items-start gap-1.5 rounded-xl px-4 py-3 text-left"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2">
          <UploadCloud className="size-4" aria-hidden="true" />
          <span className="text-[13.5px] font-extrabold">Importar extrato</span>
        </span>
        <span className="flex items-center gap-1.5">
          {NEUTRAL_FORMATS.map((format) => (
            <span
              key={format}
              className="rounded-[6px] bg-white/20 px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wide text-white/90"
            >
              {format}
            </span>
          ))}
          <span className="rounded-[6px] bg-white px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wide text-accent">
            PDF
          </span>
        </span>
      </Button>
      <ImportModal open={open} onOpenChange={setOpen} accountId={accountId} />
    </>
  );
}
