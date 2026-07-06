"use client";

import type { ReactNode } from "react";

import { useIsDesktop } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type FormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** `max-w-lg` (500px) por padrão; `wide` usa 600px para formulários com mais campos (handoff, "FormModal/FormDrawer"). */
  size?: "default" | "wide";
};

/**
 * Par FormModal/FormDrawer unificado num só componente: Dialog centralizado
 * no desktop, Sheet (drawer) de baixo no mobile — nunca telas separadas para
 * formulário (docs/05-UX_RULES.md, "Modais"). `Esc` fecha, foco automático no
 * primeiro campo fica a cargo do conteúdo (`autoFocus` no primeiro input).
 */
export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "default",
}: FormModalProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "max-h-[85vh] overflow-y-auto sm:max-w-[500px]",
            size === "wide" && "sm:max-w-[600px]",
          )}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
