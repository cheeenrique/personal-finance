"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportButton } from "./import-button";
import { TransferModal } from "./transfer-modal";
import type { AccountCardData } from "./types";

type AccountHeaderActionsProps = {
  accountId: string;
  accounts: AccountCardData[];
};

/**
 * Ações do cabeçalho do detalhe de conta (handoff "Conta (Detalhe)") —
 * Transferir (outline, some com <2 contas, mesma regra de `AccountGrid`) +
 * Importar extrato (accent, `ImportButton`).
 */
export function AccountHeaderActions({ accountId, accounts }: AccountHeaderActionsProps) {
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {accounts.length >= 2 && (
        <>
          <Button type="button" variant="neutral" size="lg" className="gap-2" onClick={() => setTransferOpen(true)}>
            <Repeat className="size-4" aria-hidden="true" />
            Transferir
          </Button>
          <TransferModal open={transferOpen} onOpenChange={setTransferOpen} accounts={accounts} />
        </>
      )}
      <ImportButton accountId={accountId} />
    </div>
  );
}
