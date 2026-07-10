"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { notifySuccess } from "@/lib/toast";
import { aggregateCommit, isPdfImportFile } from "./import-file-utils";
import { ImportDropzone } from "./import-dropzone";
import { STEP_TRANSITION, stepVariants } from "./import-motion";
import { ImportPreview } from "./import-preview";
import { ImportResult } from "./import-result";
import { ImportStepper } from "./import-stepper";
import { ACCOUNT_PERIOD_SUMMARY_QUERY_KEY } from "./use-account-period-summary";
import { useImportFiles } from "./use-import-files";

type ImportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
};

/**
 * Importador de extrato multi-arquivo (docs/03-DATABASE.md, "Importação de
 * Extrato OFX"; multi-formato em
 * docs/superpowers/specs/2026-07-08-import-multiformato-design.md) —
 * dropzone com drag&drop de vários arquivos de uma vez → prévia agregada
 * (nada gravado) → confirma → grava. O front itera as Server Actions por
 * arquivo (`use-import-files.ts`: 1 preview + 1 commit cada), sem action
 * batch nova. 3 passos dentro do MESMO modal, nunca telas separadas
 * (docs/05-UX_RULES.md, "Modais"). Reimportar é seguro — o módulo dedupa
 * por `fitId` (ou fallback) no backend, então repetir a confirmação não
 * duplica nada.
 */
export function ImportModal({ open, onOpenChange, accountId }: ImportModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { step, entries, isAnalyzing, isConfirming, addFiles, removeFile, analyze, confirm, reset } =
    useImportFiles(accountId);

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleClose() {
    handleOpenChange(false);
  }

  async function handleConfirm() {
    const nextEntries = await confirm();
    const totals = aggregateCommit(nextEntries);

    invalidateAllTransactionLists(queryClient);
    // `invalidateAllTransactionLists` cobre "account-transactions" mas não
    // este prefixo (adicionado depois, fora do arquivo compartilhado
    // `transaction-query-keys.ts` — ver "Improvement Suggestions" no resumo
    // da tarefa) — invalida manualmente aqui, o único ponto de commit do
    // import.
    void queryClient.invalidateQueries({ queryKey: [ACCOUNT_PERIOD_SUMMARY_QUERY_KEY] });
    router.refresh();
    if (totals.imported > 0 || totals.duplicados > 0) notifySuccess("Extrato importado");
  }

  const hasReadyFiles = entries.some((entry) => entry.status === "ready");
  const isReadingAny = entries.some((entry) => entry.status === "reading");
  const totalNovos = entries.reduce((sum, entry) => sum + (entry.preview?.novos.length ?? 0), 0);
  const isAnalyzingPdf = isAnalyzing && entries.some((entry) => entry.status === "ready" && isPdfImportFile(entry.name));

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Importar extrato"
      description="Arraste um ou mais extratos (OFX, CSV, XLS, XLSX ou PDF), confira a prévia agregada e só grava depois de confirmar."
      size="wide"
    >
      <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-4">
          <ImportStepper step={step} />

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={STEP_TRANSITION}>
              {step === "select" && (
                <ImportDropzone entries={entries} onAddFiles={addFiles} onRemoveFile={removeFile} disabled={isAnalyzing} />
              )}
              {step === "preview" && <ImportPreview entries={entries} />}
              {step === "result" && <ImportResult entries={entries} />}
            </motion.div>
          </AnimatePresence>

          {isAnalyzingPdf && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Extraindo lançamentos do PDF com IA (pode levar alguns segundos)…
            </p>
          )}

          <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
            {step !== "result" && (
              <Button type="button" variant="outline" onClick={handleClose} disabled={isAnalyzing || isConfirming}>
                Cancelar
              </Button>
            )}
            {step === "select" && (
              <Button type="button" onClick={() => void analyze()} disabled={!hasReadyFiles || isReadingAny || isAnalyzing}>
                {isAnalyzing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Analisar arquivos
              </Button>
            )}
            {step === "preview" && (
              <Button type="button" onClick={() => void handleConfirm()} disabled={isConfirming || totalNovos === 0}>
                {isConfirming && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Confirmar importação
              </Button>
            )}
            {step === "result" && (
              <Button type="button" onClick={handleClose}>
                Concluir
              </Button>
            )}
          </div>
        </div>
      </MotionConfig>
    </FormModal>
  );
}
