"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Clock, FileText, Loader2, Sparkles } from "lucide-react";

import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import type { ImportTarget } from "@/modules/imports/types";
import styles from "./import-analyzing.module.css";

type ImportAnalyzingProps = {
  target: ImportTarget;
  /** Nomes DOS ARQUIVOS COM EXTENSÃO (ex. "fatura.pdf") — pedido explícito do
   * dono do produto, ver handoff item 1. Derivado pelo `ImportModal` a partir
   * dos `entries` PDF em análise (`entry.name`, já inclui a extensão). */
  fileNames: string[];
};

/** ETA de COPY[target] (`import-modal.tsx`) reduzido só ao trecho de duração —
 * mantido aqui pra não mexer no objeto COPY existente ("O que NÃO muda"). */
const ETA_LABEL: Record<ImportTarget["kind"], string> = {
  account: "alguns segundos",
  card: "até 1–2 min",
};

/** 4 fases do handoff, ~2.2s cada (`pf-phase`, 8.8s de ciclo total). */
const PHASES = [
  "Lendo o documento…",
  "Identificando lançamentos…",
  "Classificando categorias…",
  "Removendo duplicados…",
] as const;

const PHASE_INTERVAL_MS = 2200;

/** Larguras das linhas-esqueleto do documento — só visual, portado do protótipo. */
const DOC_LINE_WIDTHS = ["82%", "64%", "90%", "52%", "76%", "60%"];

/**
 * Chips ilustrativos de "lançamentos encontrados" — a Server Action
 * (`previewImportAction`) é ATÔMICA, só volta no fim sem streaming, então NÃO
 * há como mostrar lançamentos reais durante a análise. Rótulo genérico +
 * skeleton no lugar do valor, nunca dado inventado (handoff item 3).
 */
const CHIP_DELAYS_MS = [150, 450, 750];

function fileSubtitle(fileNames: string[]): string {
  if (fileNames.length <= 1) return fileNames[0] ?? "";
  const extra = fileNames.length - 1;
  return `${fileNames[0]} +${extra} arquivo${extra > 1 ? "s" : ""}`;
}

/**
 * Painel "IA lendo o documento" — substitui o `Loader2 + extractingLabel` de
 * 1 linha durante `isAnalyzing` (extração de PDF por IA leva de alguns
 * segundos a 1-2 min) por algo que comunique o que está acontecendo,
 * reduzindo a ansiedade da espera (docs/superpowers/.../import-analyzing-handoff.md).
 * Renderizado pelo `ImportModal` no lugar da dropzone quando `isAnalyzingPdf`
 * — import só de OFX/CSV (instantâneo, sem IA) nunca passa por aqui.
 *
 * Keyframes CSS portados 1:1 do protótipo (`import-analyzing.module.css`).
 * A rotação das 4 fases usa um TIMER (`useEffect`/`setInterval`) em vez de
 * só CSS — precisa disso pro `aria-live` conseguir anunciar a fase atual de
 * verdade (texto mudando), não só opacidade indo e voltando num DOM estático.
 * `useReducedMotion` (framer-motion) — mesmo padrão de `account-flow-summary.tsx`
 * — desliga o timer e as classes de animação, caindo pro estado estático
 * (documento parado, label única "Extraindo com IA…", barra sem realce).
 */
export function ImportAnalyzing({ target, fileNames }: ImportAnalyzingProps) {
  const prefersReducedMotion = useReducedMotion();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const motionOn = !prefersReducedMotion;

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => setPhaseIndex((current) => (current + 1) % PHASES.length), PHASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  const announcedPhase = prefersReducedMotion ? "Extraindo com IA…" : PHASES[phaseIndex];

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-card", CARD_SHADOW_CLASS)}>
      {/* header: badge de IA + nome do arquivo + ETA */}
      <div className="flex items-center gap-2.5 border-b border-border px-4.5 py-4">
        <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-primary/18 text-on-primary">
          <Sparkles className={cn("size-[17px]", motionOn && styles.sparkle)} aria-hidden="true" />
          <Sparkles
            className={cn("absolute top-1 right-0.5 size-[9px]", motionOn && styles.sparkleSecondary)}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-foreground">Extraindo com inteligência artificial</p>
          <p className="truncate text-xs font-semibold text-muted-foreground">{fileSubtitle(fileNames)}</p>
        </div>
        <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[11.5px] font-bold whitespace-nowrap text-muted-foreground">
          <Clock className="size-3" aria-hidden="true" />
          {ETA_LABEL[target.kind]}
        </span>
      </div>

      {/* documento com beam de scan + chips ilustrativos */}
      <div className="flex items-center gap-5 px-4.5 py-6">
        <div className="relative w-[150px] shrink-0">
          <div
            className={cn("absolute -inset-3.5 rounded-3xl", motionOn && styles.glow)}
            aria-hidden="true"
          />
          <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3.5 shadow-[0_10px_28px_rgba(0,0,0,0.4)]">
            <div className="mb-3 flex items-center gap-1.5">
              <span className="flex size-[22px] items-center justify-center rounded-md bg-destructive/16 text-on-danger">
                <FileText className="size-3" aria-hidden="true" />
              </span>
              <span className="text-[9px] font-extrabold tracking-[0.08em] text-on-danger uppercase">PDF</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {DOC_LINE_WIDTHS.map((width, index) => (
                <span
                  key={index}
                  className={cn("h-[7px] rounded-full bg-secondary", motionOn && styles.detectLine)}
                  style={{ width, animationDelay: motionOn ? `${index * 0.22}s` : undefined }}
                />
              ))}
            </div>
            {motionOn && (
              <div className={cn("pointer-events-none absolute inset-x-0 top-11 h-6.5", styles.beam)} aria-hidden="true">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-on-primary/26 to-transparent" />
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-on-primary shadow-[0_0_12px_2px_rgba(143,171,255,0.8)]" />
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-[11px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">Lançamentos encontrados</p>
          <div className="flex flex-col gap-2">
            {CHIP_DELAYS_MS.map((delay, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center justify-between gap-2.5 rounded-[10px] border border-border bg-card px-2.5 py-2",
                  motionOn && styles.chipIn,
                )}
                style={{ animationDelay: motionOn ? `${delay}ms` : undefined }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full bg-on-primary" aria-hidden="true" />
                  <span className="truncate text-[12.5px] font-bold text-foreground">Lançamento identificado</span>
                </div>
                <span className="h-3 w-12 shrink-0 animate-pulse rounded-full bg-secondary" aria-hidden="true" />
              </div>
            ))}
            <div
              className={cn("flex items-center gap-2 px-2.5 py-2", motionOn && styles.chipIn)}
              style={{ animationDelay: motionOn ? "1150ms" : undefined }}
            >
              <span className="inline-flex gap-[3px]" aria-hidden="true">
                {[0, 0.2, 0.4].map((delay) => (
                  <span
                    key={delay}
                    className={cn("size-[5px] rounded-full bg-on-primary", motionOn && styles.dot)}
                    style={{ animationDelay: motionOn ? `${delay}s` : undefined }}
                  />
                ))}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">lendo mais lançamentos…</span>
            </div>
          </div>
        </div>
      </div>

      {/* label de fase rotativa — sr-only mudando de texto anuncia a fase pra leitor de tela */}
      <div className="relative mx-4.5 h-6">
        <span className="sr-only" aria-live="polite">
          {announcedPhase}
        </span>
        {prefersReducedMotion ? (
          <div className="flex items-center gap-2" aria-hidden="true">
            <Loader2 className="size-3.5 text-on-primary" aria-hidden="true" />
            <span className="text-[13px] font-bold text-foreground">Extraindo com IA…</span>
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
      <div className="relative mx-4.5 mt-3.5 mb-5 h-1 overflow-hidden rounded-full bg-secondary">
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
