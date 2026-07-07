"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { previewOfxImportAction, commitOfxImportAction } from "@/modules/imports/actions";
import { TransactionType } from "@/generated/prisma/enums";
import type { OfxImportCommitResult, OfxImportPreview } from "@/modules/imports/types";

type OfxImportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
};

type Step = "select" | "preview" | "result";

/**
 * Importador de extrato OFX (docs/03-DATABASE.md, "Importação de Extrato
 * OFX"): sobe o arquivo → prévia (novos/duplicados/erros, nada gravado) →
 * confirma → grava. 3 passos dentro do MESMO modal (nunca telas separadas,
 * docs/05-UX_RULES.md, "Modais"). Reimportar o mesmo arquivo é seguro — o
 * módulo dedupa por `fitId` (ou fallback), então repetir a confirmação não
 * duplica nada.
 */
export function OfxImportModal({ open, onOpenChange, accountId }: OfxImportModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("select");
  // Muda a cada reset — remonta o <input type="file"> (componente não
  // controlado) pra limpar a seleção anterior, sem depender de ref através do
  // wrapper `@base-ui/react/input` (nenhum outro componente do projeto passa
  // `ref` pro `Input`; remount por `key` é mais simples e sem ambiguidade).
  const [fileInputKey, setFileInputKey] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<OfxImportPreview | null>(null);
  const [result, setResult] = useState<OfxImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetState() {
    setStep("select");
    setFileInputKey((key) => key + 1);
    setFileName(null);
    setFileContent(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetState();
    onOpenChange(next);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    startTransition(async () => {
      // `file.text()` já decodifica utf-8 — o parser (`ofx-parser.ts`) recebe
      // string pronta, sem lidar com encoding (docs/03-DATABASE.md).
      const content = await file.text();
      setFileContent(content);

      const response = await previewOfxImportAction(accountId, content);
      if (!response.success) {
        setError(response.error.message);
        return;
      }

      setPreview(response.data);
      setStep("preview");
    });
  }

  function handleConfirm() {
    if (!fileContent) return;

    startTransition(async () => {
      const response = await commitOfxImportAction(accountId, fileContent);
      if (!response.success) {
        setError(response.error.message);
        return;
      }

      setResult(response.data);
      setStep("result");
      invalidateAllTransactionLists(queryClient);
      router.refresh();
      notifySuccess("Extrato importado");
    });
  }

  function handleClose() {
    handleOpenChange(false);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Importar extrato OFX"
      description="Sobe o extrato do banco (.ofx), confere uma prévia e só grava depois de confirmar."
      size="wide"
    >
      <div className="flex flex-col gap-4">
        {step === "select" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ofx-file">Arquivo OFX</Label>
            <Input
              key={fileInputKey}
              id="ofx-file"
              type="file"
              accept=".ofx"
              onChange={handleFileChange}
              disabled={isPending}
            />
            {isPending && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Lendo e analisando o arquivo…
              </p>
            )}
          </div>
        )}

        {step === "preview" && preview && (
          <>
            {fileName && <p className="text-xs font-medium text-muted-foreground">Arquivo: {fileName}</p>}

            <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-center">
              <div>
                <p className="text-lg font-extrabold text-foreground">{preview.total}</p>
                <p className="text-xs font-semibold text-muted-foreground">No arquivo</p>
              </div>
              <div>
                <p className="text-lg font-extrabold text-success">{preview.novos.length}</p>
                <p className="text-xs font-semibold text-muted-foreground">Novos</p>
              </div>
              <div>
                <p className="text-lg font-extrabold text-muted-foreground">{preview.duplicados}</p>
                <p className="text-xs font-semibold text-muted-foreground">Já importados</p>
              </div>
            </div>

            {preview.novos.length > 0 && (
              <div className="flex max-h-64 flex-col overflow-y-auto rounded-lg border border-border">
                {preview.novos.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateSaoPaulo(item.date)} · {item.categoryName ?? "Sem categoria"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-mono font-semibold",
                        item.type === TransactionType.INCOME ? "text-success" : "text-destructive",
                      )}
                    >
                      {item.type === TransactionType.INCOME ? "+" : "-"}
                      {formatBRL(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {preview.erros.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-extrabold text-destructive">
                  {preview.erros.length} linha(s) com erro — não serão importadas
                </p>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {preview.erros.map((item, index) => (
                    <li key={index}>{item.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {step === "result" && result && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-center">
            <div>
              <p className="text-lg font-extrabold text-success">{result.imported}</p>
              <p className="text-xs font-semibold text-muted-foreground">Importados</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-muted-foreground">{result.duplicados}</p>
              <p className="text-xs font-semibold text-muted-foreground">Já existiam</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-destructive">{result.erros.length}</p>
              <p className="text-xs font-semibold text-muted-foreground">Com erro</p>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
          {step !== "result" && (
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancelar
            </Button>
          )}
          {step === "preview" && (
            <Button type="button" onClick={handleConfirm} disabled={isPending || preview?.novos.length === 0}>
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
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
    </FormModal>
  );
}
