import type { ReactNode } from "react";

import { auth } from "@/lib/auth";
import { ShellProvider } from "@/components/providers/shell-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { NewTransactionForm } from "@/components/forms/new-transaction-form";

/**
 * Shell compartilhado por toda rota autenticada (docs/06-SCREENS.md, "Shell
 * da Aplicação"). `/login` não usa este layout (fora do grupo `(app)`).
 * Sessão é lida uma vez aqui (Server Component) e repassada para os
 * componentes de UI que precisam de nome/email/iniciais.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const name = session?.user?.name;
  const email = session?.user?.email;

  return (
    <ShellProvider>
      <div className="flex min-h-svh">
        <Sidebar name={name} email={email} />

        <div className="flex min-h-svh flex-1 flex-col">
          <Header name={name} email={email} />
          <main className="flex-1 px-4 py-5 pb-28 sm:px-7 lg:pb-6">{children}</main>
        </div>
      </div>

      <BottomNav />
      <CommandPalette />
      <NewTransactionForm />
    </ShellProvider>
  );
}
