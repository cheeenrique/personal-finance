"use client";

import { useEffect, useState } from "react";

import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import type { TransactionType } from "@/generated/prisma/enums";

import { AccountFlowSummary } from "./account-flow-summary";
import { AccountKpiRow } from "./account-kpi-row";
import { AccountPeriodFilterBar } from "./account-period-filter";
import { AccountTransactionsHistory } from "./account-transactions-history";
import { accountPeriodFullLabel, accountPeriodShortLabel, useAccountPeriodFilter } from "./use-account-period-filter";
import { useAccountPeriodSummary } from "./use-account-period-summary";

const SEARCH_DEBOUNCE_MS = 300;

type AccountOverviewProps = {
  accountId: string;
  balance: string;
  initialBalance: string;
};

/**
 * Orquestrador do detalhe de conta (handoff "Conta (Detalhe)") — dono do
 * filtro compartilhado (período/tipo/categoria/busca) entre os 3 blocos que
 * dependem dele: KPIs "Entradas/Saídas do período" (`AccountKpiRow`), "Fluxo
 * do período" (`AccountFlowSummary`) e o histórico paginado
 * (`AccountTransactionsHistory`). Os 2 primeiros só reagem ao PERÍODO
 * (`accountPeriodSummaryAction` não recebe tipo/categoria/busca — soma
 * INCOME/EXPENSE do range inteiro); o histórico usa os 4 filtros.
 */
export function AccountOverview({ accountId, balance, initialBalance }: AccountOverviewProps) {
  const periodFilter = useAccountPeriodFilter();
  const referenceData = useTransactionsReferenceData();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [type, setType] = useState<TransactionType | undefined>(undefined);

  // Mesmo debounce (300ms) que a `DataTable` tinha internamente — a busca só
  // dispara a query da tabela depois de o usuário parar de digitar (rule
  // 05-naming-size/UX: "Debounce search/filter inputs 300-500ms").
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { summary, loading: summaryLoading } = useAccountPeriodSummary({
    accountId,
    dateFrom: periodFilter.range.dateFrom,
    dateTo: periodFilter.range.dateTo,
  });

  return (
    <div className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <AccountKpiRow
        balance={balance}
        initialBalance={initialBalance}
        income={summary.income}
        incomeCount={summary.incomeCount}
        expense={summary.expense}
        expenseCount={summary.expenseCount}
        periodShortLabel={accountPeriodShortLabel(periodFilter.mode)}
        loading={summaryLoading}
      />

      <AccountPeriodFilterBar
        search={searchInput}
        onSearchChange={setSearchInput}
        mode={periodFilter.mode}
        setMode={periodFilter.setMode}
        customFrom={periodFilter.customFrom}
        setCustomFrom={periodFilter.setCustomFrom}
        customTo={periodFilter.customTo}
        setCustomTo={periodFilter.setCustomTo}
        categoryId={categoryId}
        onCategoryIdChange={setCategoryId}
        categoryOptions={referenceData.categoryOptions}
        categoryOptionsLoading={referenceData.loading}
        type={type}
        onTypeChange={setType}
      />

      <AccountFlowSummary
        periodLabel={accountPeriodFullLabel(periodFilter.mode)}
        income={summary.income}
        expense={summary.expense}
        loading={summaryLoading}
      />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-foreground">Histórico de transações</h3>
        <AccountTransactionsHistory
          accountId={accountId}
          search={search}
          categoryId={categoryId}
          type={type}
          dateFrom={periodFilter.range.dateFrom}
          dateTo={periodFilter.range.dateTo}
          referenceData={referenceData}
        />
      </div>
    </div>
  );
}
