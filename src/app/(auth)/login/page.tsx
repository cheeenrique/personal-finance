import { BrandMark } from "@/components/shared/brand";
import { LoginForm } from "@/components/forms/login-form";
import { CARD_SHADOW_CLASS, cn } from "@/lib/utils";

/**
 * Página standalone, fora do shell autenticado
 * (design/PERSONAL_FINANCE_DS_HANDOFF.md, "Login").
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div
        className={cn(
          "w-full max-w-[400px] rounded-[16px] border border-border bg-card p-8",
          CARD_SHADOW_CLASS,
        )}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <h1 className="mt-3 text-[20px] font-extrabold text-foreground">
            Personal Finance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre para acessar seu painel financeiro.
          </p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
