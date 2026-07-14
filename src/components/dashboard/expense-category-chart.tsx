"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import type { CardType } from "@/generated/prisma/enums";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppDonutChart, type DonutChartSlice } from "@/components/shared/charts/donut-chart";
import { resolveCategoryColor } from "@/components/shared/charts/category-palette";
import { formatBRL } from "@/lib/money/format";
import { cn } from "@/lib/utils";

/**
 * Shape serializável pra atravessar o boundary RSC → client (Decimal do
 * Prisma NÃO sobrevive ao flight — vira string/number e `.toNumber()`
 * quebra em prod). O server converte em `dashboard/page.tsx`.
 */
export type ClientExpenseByCardTree = {
  cards: Array<{
    cardId: string;
    cardName: string;
    cardType: CardType;
    total: number;
    categories: Array<{ categoryId: string; categoryName: string; total: number }>;
  }>;
  accountCategories: Array<{ categoryId: string; categoryName: string; total: number }>;
};

type ExpenseCategoryChartProps = {
  tree: ClientExpenseByCardTree;
};

type TopRow =
  | {
      kind: "card";
      id: string;
      label: string;
      value: number;
      color: string;
      children: Array<{ id: string; label: string; value: number }>;
    }
  | {
      kind: "account";
      id: string;
      label: string;
      value: number;
      color: string;
    };

/**
 * "Gastos por categoria" do Dashboard — donut + lista em árvore
 * (docs/superpowers/specs/2026-07-08-gastos-por-categoria-arvore-design.md).
 * Fatias = cartões (pastas) + categorias de conta. Lista: cartões
 * expansíveis (fechados por padrão) + categorias de conta flat.
 */
export function ExpenseCategoryChart({ tree }: ExpenseCategoryChartProps) {
  const topRows: TopRow[] = [
    ...tree.cards.map((card, index) => ({
      kind: "card" as const,
      id: card.cardId,
      label: card.cardName,
      value: card.total,
      color: resolveCategoryColor(index),
      children: card.categories.map((category) => ({
        id: category.categoryId,
        label: category.categoryName,
        value: category.total,
      })),
    })),
    ...tree.accountCategories.map((category, index) => ({
      kind: "account" as const,
      id: category.categoryId,
      label: category.categoryName,
      value: category.total,
      color: resolveCategoryColor(tree.cards.length + index),
    })),
  ];

  const slices: DonutChartSlice[] = topRows.map((row) => ({
    label: row.label,
    value: row.value,
    color: row.color,
  }));

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const isEmpty = slices.length === 0;

  return (
    <ChartWrapper
      title="Gastos por categoria"
      empty={isEmpty}
      emptyMessage="Nenhum gasto registrado neste mês ainda."
      height={300}
      // Mobile: card cresce com o conteúdo (donut empilhado + lista completa,
      // ~10 itens) em vez de travar em 300px e mostrar só ~2 linhas. Desktop
      // (`sm:`) mantém 300px lado a lado.
      heightClassName="min-h-[480px] sm:h-[300px] sm:min-h-0"
    >
      <div className="flex h-full flex-col gap-4 sm:flex-row">
        <div className="relative mx-auto aspect-square w-full max-w-[200px] shrink-0 sm:mx-0 sm:aspect-auto sm:h-full sm:w-[42%] sm:max-w-none">
          <AppDonutChart
            data={slices}
            centerLabel={
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="font-mono text-[15px] font-semibold text-foreground">
                  {formatBRL(total)}
                </span>
              </>
            }
          />
        </div>

        <ul className="flex flex-col gap-0.5 pr-1 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
          {topRows.map((row) =>
            row.kind === "card" ? (
              <CardTreeRow key={`card-${row.id}`} row={row} total={total} />
            ) : (
              <CategoryRankRow
                key={`account-${row.id}`}
                label={row.label}
                value={row.value}
                color={row.color}
                percent={total > 0 ? (row.value / total) * 100 : 0}
              />
            ),
          )}
        </ul>
      </div>
    </ChartWrapper>
  );
}

function CardTreeRow({
  row,
  total,
}: {
  row: Extract<TopRow, { kind: "card" }>;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const percent = total > 0 ? (row.value / total) * 100 : 0;

  return (
    <li className="rounded-md odd:bg-secondary/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-1.5 py-1 text-left text-[12px] leading-tight"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            aria-hidden="true"
          />
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: row.color }}
            aria-hidden="true"
          />
          <span className="truncate font-medium text-foreground">{row.label}</span>
        </span>
        <span className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
          <span className="text-foreground">{formatBRL(row.value)}</span>
          <span className="w-11 text-right text-muted-foreground">{percent.toFixed(1)}%</span>
        </span>
      </button>

      {open && row.children.length > 0 && (
        <ul className="mb-1 ml-5 border-l border-border/60 pl-2">
          {row.children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between gap-2 px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground"
            >
              <span className="truncate">{child.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-foreground/80">
                {formatBRL(child.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function CategoryRankRow({
  label,
  value,
  color,
  percent,
}: {
  label: string;
  value: number;
  color: string;
  percent: number;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[12px] leading-tight odd:bg-secondary/40">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="truncate font-medium text-foreground">{label}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
        <span className="text-foreground">{formatBRL(value)}</span>
        <span className="w-11 text-right text-muted-foreground">{percent.toFixed(1)}%</span>
      </span>
    </li>
  );
}
