"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HealthScoreHelpModal } from "@/components/dashboard/health-score-help-modal";

/**
 * Botão "i" ao lado do título "Saúde financeira" (`HealthScoreCard`, Server
 * Component) que abre `HealthScoreHelpModal`. Isolado num Client Component
 * próprio — só ele precisa de `useState` — mesmo padrão do botão de ajuda em
 * `TelegramCard` (`CircleHelp` + `isHelpOpen`), aqui com o glifo "i" (`Info`)
 * porque a task pede a afordância "i", não "?".
 */
export function HealthScoreInfoButton() {
  const [isHelpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setHelpOpen(true)}
        aria-label="Como calculamos a Saúde financeira"
      >
        <Info className="size-4" aria-hidden="true" />
      </Button>

      <HealthScoreHelpModal open={isHelpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
