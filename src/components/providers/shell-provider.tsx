"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { TransactionType } from "@/generated/prisma/enums";

type ShellContextValue = {
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  isTransactionModalOpen: boolean;
  transactionModalDefaultType: TransactionType | undefined;
  openTransactionModal: (defaultType?: TransactionType) => void;
  closeTransactionModal: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

/** Elementos onde atalhos de tecla única (`g d`, `g t`, `g c`) nunca devem interceptar digitação normal. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * Estado global do shell autenticado: Command Palette (`Ctrl+K`) e o modal de
 * Nova Transação (`Ctrl+N`), compartilhados entre Header, BottomNav e
 * CommandPalette — nunca uma instância por componente (docs/06-SCREENS.md,
 * "Botão de ação rápida abre o mesmo componente usado em qualquer outro
 * ponto do sistema para criar transação — não duplicar modal").
 */
export function ShellProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isTransactionModalOpen, setTransactionModalOpen] = useState(false);
  const [transactionModalDefaultType, setTransactionModalDefaultType] = useState<
    TransactionType | undefined
  >(undefined);

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const toggleCommandPalette = useCallback(() => setCommandPaletteOpen((open) => !open), []);

  const openTransactionModal = useCallback((defaultType?: TransactionType) => {
    setTransactionModalDefaultType(defaultType);
    setTransactionModalOpen(true);
  }, []);
  const closeTransactionModal = useCallback(() => setTransactionModalOpen(false), []);

  const lastGKeyAt = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isModifierCombo = event.metaKey || event.ctrlKey;

      // Ctrl+K / Cmd+K — busca global (05-UX_RULES.md, "Atalhos Globais").
      if (isModifierCombo && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }

      // Ctrl+N / Cmd+N — nova transação.
      if (isModifierCombo && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setTransactionModalDefaultType(undefined);
        setTransactionModalOpen(true);
        return;
      }

      // Navegação rápida "g d" / "g t" / "g c" — nunca dentro de um campo de texto.
      if (isModifierCombo || isTypingTarget(event.target)) return;

      if (event.key.toLowerCase() === "g") {
        lastGKeyAt.current = Date.now();
        return;
      }

      const withinGSequence = Date.now() - lastGKeyAt.current < 800;
      if (!withinGSequence) return;

      const destination = { d: "/dashboard", t: "/transactions", c: "/cards" }[
        event.key.toLowerCase()
      ];
      if (destination) {
        lastGKeyAt.current = 0;
        router.push(destination);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const value = useMemo<ShellContextValue>(
    () => ({
      isCommandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      isTransactionModalOpen,
      transactionModalDefaultType,
      openTransactionModal,
      closeTransactionModal,
    }),
    [
      isCommandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      isTransactionModalOpen,
      transactionModalDefaultType,
      openTransactionModal,
      closeTransactionModal,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell deve ser usado dentro de <ShellProvider>");
  return context;
}
