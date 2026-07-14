"use client";

import type { ReactNode } from "react";

import { useIsDesktop } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
  /**
   * `max-w-lg` (500px) por padrão; `wide` usa 600px para formulários com mais
   * campos (handoff, "FormModal/FormDrawer"). `tall` abre perto da altura da
   * tela (largura como `wide`) com header/footer fixos e só o corpo
   * scrollando (`DialogContent`/`DialogBody` size="tall") — usar com `footer`
   * pra conteúdo extenso (ex.: import de fatura/contrato).
   */
  size?: "default" | "wide" | "tall";
  /**
   * Ações fixas no rodapé, fora da área scrollável — funciona em TODOS os
   * `size`. Formulário curto fica compacto (footer logo abaixo do conteúdo,
   * sem esticar até `max-h`); formulário longo rola só o corpo com o footer
   * preso na base. Ver `FormModalActions` pro padrão de botões.
   */
  footer?: ReactNode;
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
  footer,
}: FormModalProps) {
  const isDesktop = useIsDesktop();

  if (size === "tall") {
    if (isDesktop) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent size="tall">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            <DialogBody>{children}</DialogBody>
            {footer && <DialogFooter>{footer}</DialogFooter>}
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex h-[85vh] max-h-[85vh] flex-col overflow-hidden rounded-t-2xl">
          <SheetHeader className="shrink-0">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4">{children}</div>
          {footer && <SheetFooter className="shrink-0">{footer}</SheetFooter>}
        </SheetContent>
      </Sheet>
    );
  }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[85vh] flex-col overflow-hidden sm:max-w-[500px]",
            size === "wide" && "sm:max-w-[600px]",
          )}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogBody>{children}</DialogBody>
          {footer && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl">
        <SheetHeader className="shrink-0">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <SheetFooter className="shrink-0">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
