"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { logoutAction } from "@/modules/auth/actions";

type UserMenuProps = {
  name: string | null | undefined;
  email: string | null | undefined;
};

/**
 * Avatar + dropdown de perfil do Header (docs/06-SCREENS.md, "Header",
 * item 5: "Perfil (avatar) — dropdown com 'Configurações' e 'Sair'").
 */
export function UserMenu({ name, email }: UserMenuProps) {
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
        <InitialsAvatar
          name={name}
          email={email}
          size="md"
          className="transition-shadow duration-150 ease-pf-out hover:shadow-[0_4px_12px_rgba(234,88,12,0.3)]"
        />
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
