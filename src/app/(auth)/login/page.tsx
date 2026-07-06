import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-2xl font-extrabold text-foreground">
            Finanças Pessoais
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
