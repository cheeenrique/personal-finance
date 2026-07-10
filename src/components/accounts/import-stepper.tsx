import { Fragment } from "react";

import { cn } from "@/lib/utils";
import type { ImportStep } from "./import-types";

const STEPS: { key: ImportStep; number: number; label: string }[] = [
  { key: "select", number: 1, label: "Arquivos" },
  { key: "preview", number: 2, label: "Prévia" },
  { key: "result", number: 3, label: "Concluído" },
];

const STEP_ORDER: Record<ImportStep, number> = { select: 0, preview: 1, result: 2 };

type ImportStepperProps = { step: ImportStep };

/**
 * Indicador visual dos 3 passos do import (handoff "Conta (Detalhe)", modal
 * de import, "stepper visível no topo") — só desenho; o `step` real já é
 * controlado por `useImportFiles` (`import-modal.tsx`).
 */
export function ImportStepper({ step }: ImportStepperProps) {
  const current = STEP_ORDER[step];

  return (
    <div className="flex items-center gap-2 border-b border-border pb-3.5" aria-hidden="true">
      {STEPS.map((item, index) => {
        const isActive = STEP_ORDER[item.key] === current;
        const isDone = STEP_ORDER[item.key] < current;
        return (
          <Fragment key={item.key}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                  isActive || isDone ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {item.number}
              </span>
              <span className={cn("text-[12.5px] font-bold", isActive ? "text-foreground" : "text-muted-foreground")}>
                {item.label}
              </span>
            </div>
            {index < STEPS.length - 1 && <span className="text-muted-foreground/50">›</span>}
          </Fragment>
        );
      })}
    </div>
  );
}
