"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportModal } from "./import-modal";

type ImportButtonProps = { accountId: string };

/**
 * Importar extrato (docs/03-DATABASE.md, "Importação de Extrato OFX"; handoff
 * "Conta (Detalhe)", cabeçalho) — `accent` (ação que move dinheiro pra dentro
 * da conta, docs/04-DESIGN_SYSTEM.md "Accent"), ao lado de "Transferir"
 * (neutral, `AccountHeaderActions`). Os formatos aceitos ficam dentro do modal,
 * não no botão.
 */
export function ImportButton({ accountId }: ImportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="accent" size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <UploadCloud className="size-4" aria-hidden="true" />
        Importar extrato
      </Button>
      <ImportModal open={open} onOpenChange={setOpen} accountId={accountId} />
    </>
  );
}
