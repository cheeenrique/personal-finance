"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { updateProfileAction, changePasswordAction } from "@/modules/auth/actions";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";
import { notifySuccess } from "@/lib/toast";

type ProfileEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  currentEmail: string;
};

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled: boolean;
  error?: string | null;
};

/**
 * Campo de senha com toggle mostrar/ocultar — mesmo padrão visual de
 * `components/forms/login-form.tsx` (`h-10 pr-9` + botão absoluto Eye/EyeOff),
 * adaptado pra `FormField` (label + erro padrão do app, `components/forms/form-field.tsx`).
 * Extraído aqui (não em `components/forms/`) porque só este modal usa 3 campos
 * de senha — colocado até um 2º consumidor aparecer (rule 02-dry-kiss-yagni).
 */
function PasswordField({ id, label, value, onChange, autoComplete, disabled, error }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField label={label} htmlFor={id} required error={error}>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className="h-10 pr-9"
        />
        <button
          type="button"
          onClick={() => setVisible((previous) => !previous)}
          disabled={disabled}
          className={cn(
            "absolute inset-y-0 right-0 flex items-center rounded-sm px-2.5 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
            FOCUS_RING_CLASS,
          )}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </FormField>
  );
}

/** Item do box de requisitos de senha — ✓/✗ vivo conforme o usuário digita. */
function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-1.5", met ? "text-success" : "text-muted-foreground")}>
      <span aria-hidden="true">{met ? "✓" : "✗"}</span>
      {label}
    </li>
  );
}

/**
 * Modal de edição de perfil (docs/10-AUTH.md, "Perfil do Usuário") — 2 seções
 * independentes dentro do mesmo modal, cada uma com seu próprio submit:
 * Dados (nome/email, `updateProfileAction`) e Trocar senha
 * (`changePasswordAction`). `modules/auth/actions.ts`.
 *
 * Só `EMAIL_TAKEN`/`INVALID_CURRENT_PASSWORD` (erros de domínio com sentido
 * óbvio de campo) são roteados pro campo específico — os demais códigos
 * (`VALIDATION_ERROR`/`UNKNOWN_ERROR`) caem na mensagem genérica da seção,
 * mesmo padrão de `edit-transaction-modal.tsx`/`transfer-modal.tsx`.
 *
 * Nome/email locais e os 3 campos de senha resetam pros valores de props (ou
 * vazio, no caso da senha) toda vez que o modal ABRE — descarta edição não
 * salva de uma sessão anterior. NOTA: a sessão NextAuth só reflete um
 * nome/email novo no próximo login (ver `modules/auth/service.ts`
 * `updateProfile`) — reabrir o modal após salvar pode mostrar o valor antigo
 * de novo até relogar, consistente com o resto da tela (que também lê
 * name/email da sessão via `session.user`).
 */
export function ProfileEditModal({ open, onOpenChange, currentName, currentEmail }: ProfileEditModalProps) {
  const [name, setName] = useState(currentName);
  const [email, setEmail] = useState(currentEmail);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileErrors = useFieldErrors();
  const [isProfilePending, startProfileTransition] = useTransition();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordErrors = useFieldErrors();
  const [isPasswordPending, startPasswordTransition] = useTransition();

  // "Adjusting state when a prop changes" (react.dev/learn/you-might-not-need-an-effect),
  // mesmo padrão de `edit-transaction-modal.tsx` (`lastTransaction`): reseta
  // os 2 formulários toda vez que o modal transiciona de fechado -> aberto.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(currentName);
      setEmail(currentEmail);
      setProfileError(null);
      profileErrors.setFieldErrors({});

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      passwordErrors.setFieldErrors({});
    }
  }

  const hasMinLength = newPassword.length >= 8;
  const isDifferentFromCurrent = newPassword.length > 0 && newPassword !== currentPassword;

  function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();
    setProfileError(null);

    const errors: Record<string, string> = {};
    if (isBlank(name)) errors.name = "Nome é obrigatório.";
    if (isBlank(email)) errors.email = "Email é obrigatório.";
    profileErrors.setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startProfileTransition(async () => {
      const result = await updateProfileAction({ name, email });

      if (!result.success) {
        if (result.error.code === "EMAIL_TAKEN") {
          profileErrors.setFieldErrors({ email: result.error.message });
          return;
        }
        setProfileError(result.error.message);
        return;
      }

      setName(result.data.name);
      setEmail(result.data.email);
      notifySuccess("Dados atualizados");
    });
  }

  function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);

    const errors: Record<string, string> = {};
    if (isBlank(currentPassword)) errors.currentPassword = "Informe sua senha atual.";
    if (isBlank(newPassword)) errors.newPassword = "Informe a nova senha.";
    if (isBlank(confirmPassword)) errors.confirmPassword = "Confirme a nova senha.";
    else if (confirmPassword !== newPassword) errors.confirmPassword = "As senhas não coincidem.";
    passwordErrors.setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startPasswordTransition(async () => {
      const result = await changePasswordAction({ currentPassword, newPassword });

      if (!result.success) {
        if (result.error.code === "INVALID_CURRENT_PASSWORD") {
          passwordErrors.setFieldErrors({ currentPassword: result.error.message });
          return;
        }
        setPasswordError(result.error.message);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      passwordErrors.setFieldErrors({});
      notifySuccess("Senha alterada");
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Editar perfil"
      description="Atualize seus dados ou troque sua senha."
    >
      <div className="flex flex-col gap-6">
        <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
          <FormField label="Nome" htmlFor="profile-name" required error={profileErrors.fieldErrors.name}>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                profileErrors.clearFieldError("name");
              }}
              aria-invalid={Boolean(profileErrors.fieldErrors.name)}
              disabled={isProfilePending}
            />
          </FormField>

          <FormField label="Email" htmlFor="profile-email" required error={profileErrors.fieldErrors.email}>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                profileErrors.clearFieldError("email");
              }}
              aria-invalid={Boolean(profileErrors.fieldErrors.email)}
              disabled={isProfilePending}
            />
          </FormField>

          {profileError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {profileError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isProfilePending}>
              {isProfilePending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Salvar dados
            </Button>
          </div>
        </form>

        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4 border-t border-border pt-6">
          <PasswordField
            id="profile-current-password"
            label="Senha atual"
            value={currentPassword}
            onChange={(value) => {
              setCurrentPassword(value);
              passwordErrors.clearFieldError("currentPassword");
            }}
            autoComplete="current-password"
            disabled={isPasswordPending}
            error={passwordErrors.fieldErrors.currentPassword}
          />

          <div className="flex flex-col gap-2">
            <PasswordField
              id="profile-new-password"
              label="Nova senha"
              value={newPassword}
              onChange={(value) => {
                setNewPassword(value);
                passwordErrors.clearFieldError("newPassword");
              }}
              autoComplete="new-password"
              disabled={isPasswordPending}
              error={passwordErrors.fieldErrors.newPassword}
            />

            <ul className="flex flex-col gap-1 rounded-lg bg-secondary/60 p-3 text-[12px] font-medium">
              <PasswordRequirement met={hasMinLength} label="Pelo menos 8 caracteres" />
              <PasswordRequirement met={isDifferentFromCurrent} label="Diferente da senha atual" />
            </ul>
          </div>

          <PasswordField
            id="profile-confirm-password"
            label="Confirmar nova senha"
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              passwordErrors.clearFieldError("confirmPassword");
            }}
            autoComplete="new-password"
            disabled={isPasswordPending}
            error={passwordErrors.fieldErrors.confirmPassword}
          />

          {passwordError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {passwordError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPasswordPending}>
              {isPasswordPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Trocar senha
            </Button>
          </div>
        </form>
      </div>
    </FormModal>
  );
}
