"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OfxImportModal } from "./ofx-import-modal";

type OfxImportButtonProps = { accountId: string };

/**
 * Gatilho do importador de extrato OFX (docs/03-DATABASE.md, "Importação de
 * Extrato OFX") — cinza/neutro (`buttonVariants({ variant: "neutral" })`,
 * ajuste do dono), nunca accent/primary: é ação de navegação/utilitária, não
 * uma que move dinheiro por si só. Mesmo tom já usado em `SectionCard`,
 * `dashboard/quick-actions.tsx` e `ExportCsvButton`. O botão de CONFIRMAR
 * dentro do modal (`OfxImportModal`) é que grava — esse sim leva o tratamento
 * padrão (accent/primary).
 */
export function OfxImportButton({ accountId }: OfxImportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="neutral" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" aria-hidden="true" />
        Importar OFX
      </Button>
      <OfxImportModal open={open} onOpenChange={setOpen} accountId={accountId} />
    </>
  );
}
