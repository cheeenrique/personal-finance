import { Coins, Landmark, MoreVertical, Pencil, ShieldCheck, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type FinancingDetailHeaderProps = {
  description: string;
  lender: string | null;
  hasUnpaid: boolean;
  onSettle: () => void;
  onEdit: () => void;
  onUpdateInstallment: () => void;
  onDelete: () => void;
};

/**
 * Cabeçalho de `/financings/[id]` — extraído de `FinancingDetailView` só pra
 * caber no limite de 300 linhas do arquivo (rule 05-naming-size), sem mudar
 * nada de comportamento. Ícone/título seguem o mesmo padrão de
 * `LoanDetailView`; "Simular antecipação" continua desabilitado com
 * Tooltip (docs/52-FINANCING-ANTECIPACAO.md — não mexer no gatilho/bloqueio).
 */
export function FinancingDetailHeader({
  description,
  lender,
  hasUnpaid,
  onSettle,
  onEdit,
  onUpdateInstallment,
  onDelete,
}: FinancingDetailHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/18 text-on-primary">
          <Landmark className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-[22px] font-black text-foreground">{description}</h2>
          {lender && <p className="text-[13px] font-semibold text-muted-foreground">{lender}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/*
          Desabilitado a pedido do dono: o simulador atual só cobre o modelo
          C6 (por quantidade de parcelas), que não serve pro financiamento
          por valor/prazo (Caixa etc.) — ver docs/52-FINANCING-ANTECIPACAO.md.
          Código do modal/simulador mantido intacto (`FinancingSimulateModal`,
          renderizado em `FinancingDetailView`) pra reabilitar quando o 2º
          modelo estiver pronto — só o gatilho fica bloqueado.
        */}
        {hasUnpaid && (
          <Tooltip>
            {/*
              `variant="neutral"` (não `default`) no estado desabilitado — casa com o
              HTML de referência, que renderiza o CTA travado em cinza/bordado
              (`btnDisabled`: bg s2 + borda + texto muted), não um primary azul
              esmaecido. Gatilho/bloqueio em si intocado.
            */}
            <TooltipTrigger render={<Button type="button" variant="neutral" size="lg" disabled />}>
              <Sparkles className="size-4" aria-hidden="true" />
              Simular antecipação
            </TooltipTrigger>
            <TooltipContent>Em breve — simulação em revisão para este tipo de financiamento.</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="neutral" size="icon-md" aria-label={`Mais ações para ${description}`} />
            }
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hasUnpaid && (
              <DropdownMenuItem onClick={onSettle}>
                <ShieldCheck className="size-4" aria-hidden="true" />
                Quitar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </DropdownMenuItem>
            {hasUnpaid && (
              <DropdownMenuItem onClick={onUpdateInstallment}>
                <Coins className="size-4" aria-hidden="true" />
                Atualizar valor da parcela
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" aria-hidden="true" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
