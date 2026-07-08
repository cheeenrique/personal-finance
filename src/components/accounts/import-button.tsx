"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportModal } from "./import-modal";

type ImportButtonProps = { accountId: string };

/**
 * Gatilho do importador de extrato (OFX/CSV/XLSX — docs/03-DATABASE.md,
 * "Importação de Extrato OFX"; multi-formato em
 * docs/superpowers/specs/2026-07-08-import-multiformato-design.md) —
 * cinza/neutro (`buttonVariants({ variant: "neutral" })`, ajuste do dono),
 * nunca accent/primary: é ação de navegação/utilitária, não uma que move
 * dinheiro por si só. Mesmo tom já usado em `SectionCard`,
 * `dashboard/quick-actions.tsx` e `ExportCsvButton`. O botão de CONFIRMAR
 * dentro do modal (`ImportModal`) é que grava — esse sim leva o tratamento
 * padrão (accent/primary).
 */
export function ImportButton({ accountId }: ImportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="neutral" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" aria-hidden="true" />
        Importar extrato
      </Button>
      <ImportModal open={open} onOpenChange={setOpen} accountId={accountId} />
    </>
  );
}
