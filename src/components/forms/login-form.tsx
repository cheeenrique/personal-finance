"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginActionState } from "@/modules/auth/actions";
import { FOCUS_RING_CLASS, cn } from "@/lib/utils";

const initialState: LoginActionState = { error: null };

/**
 * Form de login — apenas campos + submit (sem chrome de card; a composição
 * do card/marca fica em `app/(auth)/login/page.tsx`,
 * design/PERSONAL_FINANCE_DS_HANDOFF.md, "Login").
 */
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[13px] font-bold text-foreground">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="voce@email.com"
          autoComplete="email"
          autoFocus
          required
          disabled={isPending}
          className="h-10"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-[13px] font-bold text-foreground">
          Senha
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Sua senha"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="h-10 pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword((previous) => !previous)}
            disabled={isPending}
            className={cn(
              "absolute inset-y-0 right-0 flex items-center rounded-sm px-2.5 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
              FOCUS_RING_CLASS,
            )}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-center text-xs font-semibold text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending} size="lg" className="mt-2 w-full">
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
