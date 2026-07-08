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
      {/*
        Shell com altura travada em 100svh: só `<main>` rola (não a janela
        inteira). Sidebar/Header já eram visualmente fixos via `sticky`; isso
        só torna explícito, e é o que permite telas como `/transactions`
        esticarem uma tabela até a base do viewport (`h-full` cascateia a
        partir daqui).
      */}
      <div className="flex h-svh overflow-hidden">
        <Sidebar name={name} email={email} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header name={name} email={email} />
          {/* `pb-28` reserva espaço pra BottomNav (mobile/tablet); soma
              `env(safe-area-inset-bottom)` porque o nav agora inclui esse
              padding extra no iOS (docs/50-AUDITORIA-BACKLOG.md, D4). Desktop
              (`lg:`) não tem BottomNav — volta pro padding padrão. */}
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-7 lg:pb-6">
            {children}
          </main>
        </div>
      </div>

      <BottomNav />
      <CommandPalette />
      <NewTransactionForm />
    </ShellProvider>
  );
}
