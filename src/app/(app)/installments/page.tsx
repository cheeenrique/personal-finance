import { auth } from "@/lib/auth";
import { transactionService } from "@/modules/transactions/service";
import { listCardOptionsAction } from "@/components/shared/entity-options-actions";
import { InstallmentsBoard } from "@/components/installments/installments-board";
import type { InstallmentPurchaseView } from "@/components/installments/types";

type InstallmentsPageProps = {
  /**
   * `?open=<id>` — usado pelo widget "Parcelamentos ativos" do Dashboard
   * pra abrir o modal de detalhes direto no item clicado, sem passar pela
   * listagem completa. `?cardId=<id>` — filtro por cartão (docs/23-INSTALLMENTS.md,
   * "Filtros"), persistido na URL (mesmo padrão de `/transactions`).
   */
  searchParams: Promise<{ open?: string; cardId?: string }>;
};

/**
 * `/installments` (docs/23-INSTALLMENTS.md). Server Component: lê o
 * progresso derivado via `transactionService.listInstallmentPurchasesWithProgress`
 * direto (sem passar por Server Action — mesmo padrão de `/accounts`, ver
 * docs/99-CLAUDE.md "Regra de Ouro"). `Prisma.Decimal`/`Date` são convertidos
 * pra string na borda antes de descer pro Client Component (RSC não
 * serializa instância de classe).
 */
export default async function InstallmentsPage({ searchParams }: InstallmentsPageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { open: openId, cardId } = await searchParams;

  const [purchases, cardOptionsResult] = await Promise.all([
    transactionService.listInstallmentPurchasesWithProgress(userId, undefined, cardId),
    listCardOptionsAction(),
  ]);

  const cardOptions = cardOptionsResult.success ? cardOptionsResult.data : [];

  const purchasesView: InstallmentPurchaseView[] = purchases.map((purchase) => ({
    id: purchase.id,
    description: purchase.description,
    cardName: purchase.cardName,
    totalAmount: purchase.totalAmount.toString(),
    installmentsCount: purchase.installmentsCount,
    paidCount: purchase.paidCount,
    paidAmount: purchase.paidAmount.toString(),
    remainingAmount: purchase.remainingAmount.toString(),
    installments: purchase.installments.map((installment) => ({
      installmentNumber: installment.installmentNumber,
      amount: installment.amount.toString(),
      date: installment.date.toISOString(),
      isPaid: installment.isPaid,
    })),
  }));

  return (
    <InstallmentsBoard
      purchases={purchasesView}
      initialOpenId={openId}
      cardOptions={cardOptions}
      selectedCardId={cardId}
    />
  );
}
