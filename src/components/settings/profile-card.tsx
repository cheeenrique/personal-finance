"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatYearSaoPaulo } from "@/lib/date/format";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";
import { ProfileEditModal } from "./profile-edit-modal";

type ProfileCardProps = {
  name: string;
  email: string;
  memberSince: Date;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Perfil (docs/12-SETTINGS.md, item 1). Nome/email vêm da sessão (`auth()`,
 * page.tsx); `memberSince` vem de `User.createdAt` (a sessão do NextAuth só
 * expõe id/name/email — `10-AUTH.md`). "Ativo" é estático: o produto não tem
 * feature de desativar usuário.
 *
 * "Editar" abre `ProfileEditModal` (update de nome/email + troca de senha,
 * `modules/auth/actions.ts`). Client Component (não Server Component como
 * antes) pra guardar o estado local do modal — mesmo padrão de
 * `AccountGrid`/`TransferModal` (components/accounts/account-grid.tsx).
 */
export function ProfileCard({ name, email, memberSince }: ProfileCardProps) {
  const [isEditOpen, setEditOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>Dados da sua conta.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {/* `size="lg"` do Avatar mapeia só pra 40px (ui/avatar.tsx) — sem
                size prop pra evitar conflito de especificidade CSS entre a
                classe base (`size-8`) e o override `data-[size=lg]:size-10`;
                aqui setamos 56px direto via className. */}
            <Avatar className="size-14">
              <AvatarFallback className="bg-gradient-to-br from-accent to-orange-700 text-base font-bold text-white">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-foreground">{name}</p>
              <p className="truncate text-[13px] font-medium text-muted-foreground">{email}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-muted-foreground">
                  Membro desde {formatYearSaoPaulo(memberSince)}
                </Badge>
                <Badge
                  variant="outline"
                  className="gap-1.5 border-success/30 bg-success/16 text-success"
                >
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  Ativo
                </Badge>
              </div>
            </div>
          </div>

          {/* Mesmo estilo dos botões neutros do dashboard ("Nova compra
              parcelada"/"Transferir" — transactions-view.tsx,
              account-grid.tsx): borda neutra, sem preenchimento, hover
              destaca a borda. */}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-border bg-transparent px-3.5 text-[13px] font-bold text-muted-foreground transition-colors duration-100 ease-pf-out hover:border-muted-foreground",
              FOCUS_RING_CLASS,
            )}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              Nome completo
            </p>
            <p className="mt-1 truncate text-sm font-bold text-foreground">{name}</p>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Email</p>
            <p className="mt-1 truncate text-sm font-bold text-foreground">{email}</p>
          </div>
        </div>
      </CardContent>

      <ProfileEditModal
        open={isEditOpen}
        onOpenChange={setEditOpen}
        currentName={name}
        currentEmail={email}
      />
    </Card>
  );
}
