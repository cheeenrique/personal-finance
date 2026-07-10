import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { formatBRL } from "@/lib/money/format";
import { AmortizationSystem } from "@/generated/prisma/enums";

const AMORTIZATION_SYSTEM_LABELS: Record<AmortizationSystem, string> = {
  [AmortizationSystem.PRICE]: "Price (parcelas fixas)",
  [AmortizationSystem.SAC]: "SAC (amortização constante)",
  [AmortizationSystem.CUSTOM]: "Personalizado (cronograma do documento)",
};

export type FinancingContractFields = {
  amortizationSystem: AmortizationSystem;
  downPayment: string | null;
  assetValue: string | null;
  assetId: string | null;
  assetName: string | null;
  cet: string | null;
  operationRef: string | null;
  financedTaxes: string | null;
  financedInsurance: string | null;
  financedFees: string | null;
};

function ContractItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold text-muted-foreground">{label}</p>
      <p className="font-mono text-[13.5px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

/**
 * Composição do contrato de financiamento — entrada, valor do bem (+ link
 * pro `Asset`), CET, custos embutidos (IOF/seguro/tarifas). Só renderiza os
 * campos NÃO-nulos (docs da tarefa, "Seção Contrato") — `Sistema de
 * amortização` sempre aparece (nunca nulo em `kind=FINANCING`, docs/
 * 03-DATABASE.md). Componente PURO de leitura (sem estado/mutação) — reusado
 * em 2 lugares (rule 02-dry-kiss-yagni, "2ª ocorrência, aceitável, observar"):
 * `financing-detail-view.tsx` (seção "Contrato" completa) e
 * `financing-form-modal.tsx` em modo edição (campos que `updateLoanAction`
 * não sabe editar, ver JSDoc de lá — exibidos aqui só informativamente).
 */
export function FinancingContractSummary({ fields }: { fields: FinancingContractFields }) {
  const hasCosts = Boolean(fields.financedTaxes || fields.financedInsurance || fields.financedFees);

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <ContractItem label="Sistema" value={AMORTIZATION_SYSTEM_LABELS[fields.amortizationSystem]} />

      {fields.downPayment && <ContractItem label="Entrada" value={formatBRL(fields.downPayment)} />}

      {fields.assetValue && (
        <ContractItem
          label="Valor do bem"
          value={
            fields.assetId ? (
              <Link
                href={`/assets/${fields.assetId}`}
                className="inline-flex items-center gap-1 text-on-primary hover:underline"
              >
                {formatBRL(fields.assetValue)}
                <ExternalLink className="size-3" aria-hidden="true" />
              </Link>
            ) : (
              formatBRL(fields.assetValue)
            )
          }
        />
      )}

      {fields.assetName && !fields.assetValue && (
        <ContractItem
          label="Bem financiado"
          value={
            <Link href={`/assets/${fields.assetId}`} className="inline-flex items-center gap-1 text-on-primary hover:underline">
              {fields.assetName}
              <ExternalLink className="size-3" aria-hidden="true" />
            </Link>
          }
        />
      )}

      {fields.cet && <ContractItem label="CET (% a.m.)" value={`${Number(fields.cet).toFixed(2)}%`} />}
      {fields.operationRef && <ContractItem label="Nº da operação" value={fields.operationRef} />}

      {hasCosts && (
        <>
          {fields.financedTaxes && <ContractItem label="IOF financiado" value={formatBRL(fields.financedTaxes)} />}
          {fields.financedInsurance && (
            <ContractItem label="Seguro financiado" value={formatBRL(fields.financedInsurance)} />
          )}
          {fields.financedFees && <ContractItem label="Tarifas financiadas" value={formatBRL(fields.financedFees)} />}
        </>
      )}
    </div>
  );
}
