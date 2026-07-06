import { auth } from "@/lib/auth";

/**
 * Placeholder mínimo — só para validar o shell (Sidebar/Header/BottomNav)
 * de ponta a ponta. O dashboard real (KPIs, gráficos, alertas) é outra
 * fase (`06-SCREENS.md`, "Dashboard").
 */
export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Olá, {session?.user?.name ?? "usuário"}.</p>
    </div>
  );
}
