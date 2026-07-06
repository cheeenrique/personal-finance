"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/modules/auth/actions";

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

type UserMenuProps = {
  name: string | null | undefined;
  email: string | null | undefined;
};

/**
 * Avatar + dropdown de perfil do Header (docs/06-SCREENS.md, "Header",
 * item 5: "Perfil (avatar) — dropdown com 'Configurações' e 'Sair'").
 */
export function UserMenu({ name, email }: UserMenuProps) {
  const initials = getInitials(name, email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Menu do perfil"
          />
        }
      >
        <Avatar className="size-[38px] transition-shadow duration-150 ease-pf-out hover:shadow-[0_4px_12px_rgba(234,88,12,0.3)]">
          <AvatarFallback className="bg-[linear-gradient(135deg,#EA580C_0%,#D97316_100%)] text-[12px] font-black text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-extrabold text-foreground">{name ?? "Usuário"}</p>
          <p className="truncate text-xs font-semibold text-muted-foreground">{email ?? ""}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="size-4" aria-hidden="true" />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction} className="contents">
          <DropdownMenuItem variant="destructive" render={<button type="submit" />}>
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
