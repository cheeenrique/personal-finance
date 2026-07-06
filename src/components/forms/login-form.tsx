"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
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
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();

  /**
   * Checagem de presença client-side antes de acionar a Server Action —
   * mesmo padrão de todo formulário do app (`components/forms/form-field.tsx`),
   * adaptado aqui porque este form usa `action={formAction}` (`useActionState`)
   * em vez de `handleSubmit`/`useTransition`: `preventDefault` cancela o
   * envio nativo (e a action) quando algum campo obrigatório está vazio.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const errors: Record<string, string> = {};
    if (isBlank(String(data.get("email") ?? ""))) errors.email = "Email é obrigatório.";
    if (isBlank(String(data.get("password") ?? ""))) errors.password = "Senha é obrigatória.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          disabled={isPending}
          onChange={() => clearFieldError("email")}
          aria-invalid={Boolean(fieldErrors.email)}
          className="h-10"
        />
        {fieldErrors.email && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldErrors.email}
          </p>
        )}
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
            disabled={isPending}
            onChange={() => clearFieldError("password")}
            aria-invalid={Boolean(fieldErrors.password)}
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
        {fieldErrors.password && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-center text-sm font-medium text-destructive">
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
