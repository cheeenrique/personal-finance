"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

type PositionSparklineProps = {
  /** Série já pronta (ex.: soma acumulada dos aportes, ordenada por data). */
  points: number[];
  className?: string;
};

/**
 * Sparkline da posição — aproximação visual da evolução do investimento a
 * partir da soma acumulada dos aportes (hoje não há snapshot de saldo por
 * dia). SVG puro, sem lib de gráfico, tom `success` (docs/04-DESIGN_SYSTEM.md).
 * Com menos de 2 pontos não há linha pra desenhar — retorna `null`.
 */
export function PositionSparkline({ points, className }: PositionSparklineProps) {
  const reduceMotion = useReducedMotion();

  const paths = useMemo(() => {
    if (points.length < 2) return null;

    const width = 100;
    const height = 40;
    // Padding vertical: sem ele a linha encosta em y=0/y=40 e o traço (strokeWidth)
    // fica clipado nas bordas do viewBox — a fonte do visual "quebrado".
    const padY = 5;
    const usableH = height - padY * 2;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;

    const coords = points.map((value, index) => ({
      x: (index / (points.length - 1)) * width,
      y: padY + (1 - (value - min) / range) * usableH,
    }));

    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(" ");

    return { line, area: `${line} L${width},${height} L0,${height} Z` };
  }, [points]);

  if (!paths) return null;

  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="Evolução acumulada dos aportes"
    >
      <path d={paths.area} fill="currentColor" className="text-success/16" />
      <motion.path
        d={paths.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="text-on-success"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}
