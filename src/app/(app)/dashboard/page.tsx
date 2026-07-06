import { auth } from "@/lib/auth";
import { logoutAction } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";

/**
 * Placeholder mínimo — só para validar o fluxo login -> rota protegida ->
 * logout de ponta a ponta. O dashboard real é outra feature (`06-SCREENS.md`).
 */
export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4">
      <h1 className="font-heading text-2xl font-extrabold text-foreground">Dashboard</h1>
      <p className="text-sm text-muted-foreground">Olá, {session?.user?.name ?? "usuário"}.</p>
      <form action={logoutAction}>
        <Button type="submit" variant="outline">
          Sair
        </Button>
      </form>
    </div>
  );
}
