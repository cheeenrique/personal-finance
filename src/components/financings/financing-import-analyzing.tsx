"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Clock, FileText, Loader2, Sparkles } from "lucide-react";

import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
// Keyframes portados 1:1 do protótipo, compartilhados com `ImportAnalyzing`
// (`components/imports/import-analyzing.module.css`) — mesmas classes
// (`sparkle`, `glow`, `beam`, `detectLine`, `chipIn`, `phaseItem`,
// `indeterminate`), só o conteúdo/copy muda pro contrato.
import styles from "@/components/imports/import-analyzing.module.css";

type FinancingImportAnalyzingProps = {
  /** Nome DO ARQUIVO COM EXTENSÃO (ex. "contrato.pdf") — mesmo padrão de `ImportAnalyzing`. */
  fileName: string;
};

/** 4 fases do painel, ~2.2s cada — mesmo ritmo de `ImportAnalyzing` (`pf-phase`, 8.8s de ciclo total, 4 itens), copy adaptada pro contrato de financiamento. */
const PHASES = [
  "Lendo o contrato…",
  "Identificando valores…",
  "Extraindo parcelas…",
  "Preenchendo campos…",
] as const;

const PHASE_INTERVAL_MS = 2200;

/** Larguras das linhas-esqueleto do documento — só visual, portado do protótipo (versão compacta de `ImportAnalyzing`). */
const DOC_LINE_WIDTHS = ["82%", "64%", "90%", "52%"];

/**
 * Campos ILUSTRATIVOS do contrato — nomes fixos do que a IA está procurando,
 * NUNCA os valores reais extraídos (esses só chegam no fim, via `onParsed`).
 * Skeleton no lugar do valor, mesmo padrão do chip "Lançamento identificado"
 * de `ImportAnalyzing` (a Server Action `parseFinancingDocumentAction` é
 * atômica, sem streaming — não há como mostrar valor real durante a análise).
 */
const FIELD_LABELS = ["Valor financiado", "Parcelas", "Taxa", "1º vencimento"] as const;
const FIELD_DELAYS_MS = [150, 450, 750, 1050];

/**
 * Painel "IA lendo o contrato" — versão compacta de `ImportAnalyzing`
 * (`components/imports/`) adaptada pro financiamento: em vez de lançamentos
 * de fatura/extrato, extrai CAMPOS do contrato (valor financiado, parcelas,
 * taxa, 1º vencimento). Renderizado por `FinancingImportButton` no lugar do
 * `FinancingImportDropzone` enquanto `parseFinancingDocumentAction` roda
 * (`importing === true`) — inline no form, sem modal separado (o form de
 * criação já é a prévia, ver JSDoc de `FinancingImportButton`).
 *
 * `useReducedMotion` (framer-motion) — mesmo padrão de `ImportAnalyzing` —
 * desliga o timer de fase e as classes de animação, caindo pro estado
 * estático (documento parado, label única, barra sem realce).
 */
export function FinancingImportAnalyzing({ fileName }: FinancingImportAnalyzingProps) {
  const prefersReducedMotion = useReducedMotion();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const motionOn = !prefersReducedMotion;

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => setPhaseIndex((current) => (current + 1) % PHASES.length), PHASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  const announcedPhase = prefersReducedMotion ? "Lendo o contrato com IA…" : PHASES[phaseIndex];

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-card", CARD_SHADOW_CLASS)}>
      {/* header: badge de IA + nome do arquivo + ETA */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span className="relative flex size-[30px] shrink-0 items-center justify-center rounded-[10px] bg-primary/18 text-on-primary">
          <Sparkles className={cn("size-[15px]", motionOn && styles.sparkle)} aria-hidden="true" />
          <Sparkles
            className={cn("absolute top-0.5 right-0 size-2", motionOn && styles.sparkleSecondary)}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-foreground">Lendo o contrato com IA</p>
          <p className="truncate text-xs font-semibold text-muted-foreground">{fileName}</p>
        </div>
        <span className="inline-flex h-[24px] shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[11px] font-bold whitespace-nowrap text-muted-foreground">
          <Clock className="size-3" aria-hidden="true" />
          pode levar alguns segundos
        </span>
      </div>

      {/* documento com beam de scan + campos identificados */}
      <div className="flex items-center gap-4 px-4 py-5">
        <div className="relative w-[104px] shrink-0">
          <div className={cn("absolute -inset-2.5 rounded-2xl", motionOn && styles.glow)} aria-hidden="true" />
          <div className="relative overflow-hidden rounded-lg border border-border bg-card p-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.4)]">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex size-[18px] items-center justify-center rounded-md bg-destructive/16 text-on-danger">
                <FileText className="size-[10px]" aria-hidden="true" />
              </span>
              <span className="text-[8px] font-extrabold tracking-[0.08em] text-on-danger uppercase">PDF</span>
            </div>
            <div className="flex flex-col gap-2">
              {DOC_LINE_WIDTHS.map((width, index) => (
                <span
                  key={index}
                  className={cn("h-[6px] rounded-full bg-secondary", motionOn && styles.detectLine)}
                  style={{ width, animationDelay: motionOn ? `${index * 0.22}s` : undefined }}
                />
              ))}
            </div>
            {motionOn && (
              <div className={cn("pointer-events-none absolute inset-x-0 top-9 h-5", styles.beam)} aria-hidden="true">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-on-primary/26 to-transparent" />
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-on-primary shadow-[0_0_12px_2px_rgba(143,171,255,0.8)]" />
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <p className="text-[10px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">Campos do contrato</p>
          <div className="flex flex-col gap-1.5">
            {FIELD_LABELS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "flex items-center justify-between gap-2.5 rounded-[9px] border border-border bg-card px-2.5 py-1.5",
                  motionOn && styles.chipIn,
                )}
                style={{ animationDelay: motionOn ? `${FIELD_DELAYS_MS[index]}ms` : undefined }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-on-primary" aria-hidden="true" />
                  <span className="truncate text-[12px] font-bold text-foreground">{label}</span>
                </div>
                <span className="h-3 w-10 shrink-0 animate-pulse rounded-full bg-secondary" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* label de fase rotativa — sr-only mudando de texto anuncia a fase pra leitor de tela */}
      <div className="relative mx-4 h-6">
        <span className="sr-only" aria-live="polite">
          {announcedPhase}
        </span>
        {prefersReducedMotion ? (
          <div className="flex items-center gap-2" aria-hidden="true">
            <Loader2 className="size-3.5 text-on-primary" aria-hidden="true" />
            <span className="text-[13px] font-bold text-foreground">Lendo o contrato com IA…</span>
          </div>
        ) : (
          PHASES.map((label, index) => (
            <div
              key={label}
              className={cn("absolute inset-0 flex items-center gap-2", styles.phaseItem)}
              style={{ animationDelay: `${index * 2.2}s` }}
              aria-hidden="true"
            >
              <Loader2 className="size-3.5 animate-spin text-on-primary" aria-hidden="true" />
              <span className="text-[13px] font-bold text-foreground">{label}</span>
            </div>
          ))
        )}
      </div>

      {/* barra indeterminada — sem % real, só comunica "trabalho em progresso" */}
      <div className="relative mx-4 mt-3 mb-4 h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "absolute inset-y-0 w-[42%] rounded-full bg-gradient-to-r from-transparent via-on-primary to-transparent",
            motionOn ? styles.indeterminate : "left-[29%]",
          )}
        />
      </div>
    </div>
  );
}
