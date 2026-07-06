import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  /** Presença = campo inválido. Renderiza a mensagem logo abaixo do controle. */
  error?: string | null;
  /** Acrescenta indicador visual (`*`) no label. */
  required?: boolean;
  /**
   * Override do className do `Label` — só existe pra telas com tipografia
   * própria (ex. `login-form.tsx`, que usa label menor/mais bold que o
   * padrão). Omitir usa o estilo padrão do `ui/label.tsx`.
   */
  labelClassName?: string;
  children: ReactNode;
};

/**
 * Wrapper padrão de campo de formulário (label + controle + erro) — unifica
 * borda vermelha + mensagem de erro abaixo do campo em todo o app
 * (docs/04-DESIGN_SYSTEM.md, "Inputs": "Sempre possuem... Mensagem de erro").
 *
 * Não valida nada — só exibe. Quem decide se `error` existe é o form pai
 * (checagem de presença client-side); o `aria-invalid` do controle interno
 * (Input/CurrencyInput/EntitySelect/DateField) fica a cargo de quem usa este
 * componente, já que cada um desses tem sua própria prop de valor/mudança.
 */
export function FormField({
  label,
  htmlFor,
  error,
  required,
  labelClassName,
  children,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className={labelClassName}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
