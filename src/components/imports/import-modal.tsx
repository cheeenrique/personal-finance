"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { ArrowLeft, Check, Loader2, Sparkles, X } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import type { EntitySelectOption } from "@/components/forms/entity-select";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { TransactionType } from "@/generated/prisma/enums";
import { notifySuccess } from "@/lib/toast";
import type { ImportTarget, ImportTransactionType } from "@/modules/imports/types";
import { ACCOUNT_PERIOD_SUMMARY_QUERY_KEY } from "@/components/accounts/use-account-period-summary";
import { aggregateCommit, isPdfImportFile } from "./import-file-utils";
import { ImportDropzone } from "./import-dropzone";
import { STEP_TRANSITION, stepVariants } from "./import-motion";
import { ImportPreview } from "./import-preview";
import { ImportResult } from "./import-result";
import { ImportStepper } from "./import-stepper";
import { useImportFiles } from "./use-import-files";

type ImportModalProps = { open: boolean; onOpenChange: (open: boolean) => void; target: ImportTarget };

const COPY: Record<ImportTarget["kind"], { title: string; description: string; extractingLabel: string; successMessage: string }> = {
  account: {
    title: "Importar extrato",
    description: "Arraste um ou mais extratos (OFX, CSV, XLS, XLSX ou PDF), confira a prévia agregada e só grava depois de confirmar.",
    extractingLabel: "Extraindo lançamentos do PDF com IA (pode levar alguns segundos)…",
    successMessage: "Extrato importado",
  },
  card: {
    title: "Importar fatura",
    description: "Arraste uma ou mais faturas em PDF (inclusive com senha), confira a prévia agregada e só grava depois de confirmar.",
    extractingLabel: "Extraindo lançamentos da fatura com IA (pode levar até 1-2 minutos)…",
    successMessage: "Fatura importada",
  },
};

/**
 * Importador multi-arquivo generalizado por `target` (conta OU cartão,
 * docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Frontend").
 * 3 passos dentro do MESMO modal (docs/05-UX_RULES.md, "Modais"). Reimportar é seguro —
 * dedup no backend (por `fitId` ou fallback `(data,valor[,descrição])`, ver
 * `modules/imports/service.ts`). Modal `size="tall"` (docs/04-DESIGN_SYSTEM.md — padrão
 * de modal alto/scrollável): header e footer fixos, só o corpo (dropzone/prévia/
 * resultado) rola — conteúdo pode ficar extenso com vários arquivos.
 */
export function ImportModal({ open, onOpenChange, target }: ImportModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Mesma fonte de categorias do resto do app (`NewTransactionForm`,
  // `TransactionFiltersBar`) — cache compartilhado via TanStack Query, sem
  // fetch novo (Refino 3, "reuse a MESMA fonte/UI de categoria, NÃO reimplemente").
  const { categoryOptions, categoryById } = useTransactionsReferenceData();

  // Nome (lowercase) → id — só pra casar a sugestão por histórico
  // (`preview.novos[].categoryName`, texto) com um id real do usuário e
  // pré-selecionar o item na prévia; nunca inventa categoria sem match.
  const categoryNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, ref] of categoryById) map.set(ref.name.toLowerCase(), id);
    return map;
  }, [categoryById]);

  // `categoryOptions` já vem agrupado "Receita"/"Despesa" (mesmo `group` usado
  // no select de Nova Transação) — só reparte por tipo pro select por item da
  // prévia nunca oferecer categoria do tipo errado (`ImportPreviewPanel`).
  const categoryOptionsByType = useMemo<Record<ImportTransactionType, EntitySelectOption[]>>(
    () => ({
      [TransactionType.INCOME]: categoryOptions.filter((option) => option.group === "Receita"),
      [TransactionType.EXPENSE]: categoryOptions.filter((option) => option.group === "Despesa"),
    }),
    [categoryOptions],
  );

  const {
    step,
    entries,
    isAnalyzing,
    isConfirming,
    addFiles,
    removeFile,
    setPassword,
    setItemCategory,
    analyze,
    confirm,
    back,
    reset,
  } = useImportFiles(target, categoryNameToId);
  const copy = COPY[target.kind];

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
    if (target.kind === "account") {
      void queryClient.invalidateQueries({ queryKey: [ACCOUNT_PERIOD_SUMMARY_QUERY_KEY] });
    }
    router.refresh();
    if (totals.imported > 0 || totals.duplicados > 0) notifySuccess(copy.successMessage);
  }

  const hasReadyFiles = entries.some((entry) => entry.status === "ready");
  const isReadingAny = entries.some((entry) => entry.status === "reading");
  const totalNovos = entries.reduce((sum, entry) => sum + (entry.preview?.novos.length ?? 0), 0);
  const isAnalyzingPdf = isAnalyzing && entries.some((entry) => entry.status === "ready" && isPdfImportFile(entry.name));

  const footer = (
    <>
      {step !== "result" && (
        <Button type="button" variant="neutral" onClick={handleClose} disabled={isAnalyzing || isConfirming}>
          <X className="size-4" aria-hidden="true" />
          Cancelar
        </Button>
      )}
      {step === "select" && (
        <Button type="button" onClick={() => void analyze()} disabled={!hasReadyFiles || isReadingAny || isAnalyzing}>
          {isAnalyzing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          Analisar arquivos
        </Button>
      )}
      {step === "preview" && (
        <Button type="button" variant="neutral" onClick={back} disabled={isConfirming}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar
        </Button>
      )}
      {step === "preview" && (
        <Button type="button" onClick={() => void handleConfirm()} disabled={isConfirming || totalNovos === 0}>
          {isConfirming ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          Confirmar importação
        </Button>
      )}
      {step === "result" && (
        <Button type="button" onClick={handleClose}>
          <Check className="size-4" aria-hidden="true" />
          Concluir
        </Button>
      )}
    </>
  );

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.description}
      size="tall"
      footer={footer}
    >
      <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-4">
          <ImportStepper step={step} />

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={STEP_TRANSITION}>
              {step === "select" && (
                <ImportDropzone
                  entries={entries}
                  onAddFiles={addFiles}
                  onRemoveFile={removeFile}
                  disabled={isAnalyzing}
                  allowPassword={target.kind === "card"}
                  onPasswordChange={setPassword}
                />
              )}
              {step === "preview" && (
                <ImportPreview
                  entries={entries}
                  categoryOptionsByType={categoryOptionsByType}
                  onCategoryChange={setItemCategory}
                />
              )}
              {step === "result" && <ImportResult entries={entries} />}
            </motion.div>
          </AnimatePresence>

          {isAnalyzingPdf && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {copy.extractingLabel}
            </p>
          )}
        </div>
      </MotionConfig>
    </FormModal>
  );
}
