import type { Metadata } from "next";
import { Nunito, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";

const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Personal Finance",
  description: "Painel de finanças pessoais.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${nunito.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <TooltipProvider>
              {children}
              {/*
                Cor por tipo via tokens do DS (docs/04-DESIGN_SYSTEM.md), não
                `richColors` do sonner (paleta própria, sem relação com os
                tokens do app). `!` é necessário: `[data-sonner-toast][data-
                styled='true']` do sonner tem mais especificidade que uma
                classe Tailwind isolada.
              */}
              <Toaster
                position="bottom-right"
                icons={{
                  success: <CheckCircle2 className="size-4" aria-hidden="true" />,
                  error: <XCircle className="size-4" aria-hidden="true" />,
                }}
                toastOptions={{
                  classNames: {
                    toast: "rounded-[10px]! border! shadow-lg!",
                    title: "font-sans! font-semibold!",
                    success: "border-success/30! bg-success/10! text-on-success!",
                    error: "border-destructive/30! bg-destructive/10! text-on-danger!",
                  },
                }}
              />
            </TooltipProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
