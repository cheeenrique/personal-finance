"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportModal } from "@/components/imports/import-modal";

type CardImportButtonProps = { cardId: string };

/** "Importar fatura" no detalhe do cartão (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Frontend") — espelha `accounts/import-button.tsx`, `target={kind:"card"}`. */
export function CardImportButton({ cardId }: CardImportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="accent" size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <UploadCloud className="size-4" aria-hidden="true" />
        Importar fatura
      </Button>
      <ImportModal open={open} onOpenChange={setOpen} target={{ kind: "card", cardId }} />
    </>
  );
}
