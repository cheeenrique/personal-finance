"use client";

import { type ChangeEvent } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type PasswordProtectedFileFieldBaseProps = {
  idPrefix: string;
  hasPassword: boolean;
  onHasPasswordChange: (hasPassword: boolean) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  disabled?: boolean;
};

type StandaloneProps = PasswordProtectedFileFieldBaseProps & {
  mode?: "standalone";
  label: string;
  helperText?: string;
  accept: string;
  onFileSelect: (file: File) => void;
  loading?: boolean;
  loadingLabel?: string;
  /** Remonta o `<input>` depois de um upload (mesmo truque de `financing-import-button.tsx` atual) — permite reimportar o MESMO arquivo. */
  inputKey: number;
};

type EmbeddedProps = PasswordProtectedFileFieldBaseProps & { mode: "embedded" };

type PasswordProtectedFileFieldProps = StandaloneProps | EmbeddedProps;

/**
 * Componente compartilhado "arquivo + senha" (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Frontend" — usado nos 2 fluxos de import por IA). Ver decisão de design no plano de
 * origem (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T15) sobre os 2
 * modos: `"standalone"` (default) tem o próprio `<input type=file>` — 1 arquivo por vez,
 * usado por `financing-import-button.tsx`; `"embedded"` é só o toggle+campo de senha,
 * embutido numa linha já existente do dropzone multi-arquivo (`card-import-button.tsx`
 * via `ImportFileRow`).
 */
export function PasswordProtectedFileField(props: PasswordProtectedFileFieldProps) {
  const { idPrefix, hasPassword, onHasPasswordChange, password, onPasswordChange, disabled } = props;

  const toggle = (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={`${idPrefix}-has-password`} className="text-[12.5px] font-medium text-muted-foreground">
        Este arquivo tem senha?
      </Label>
      <Switch
        id={`${idPrefix}-has-password`}
        size="sm"
        checked={hasPassword}
        onCheckedChange={onHasPasswordChange}
        disabled={disabled}
      />
    </div>
  );

  const passwordField = hasPassword && (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${idPrefix}-password`} className="sr-only">
        Senha do arquivo
      </Label>
      <Input
        id={`${idPrefix}-password`}
        type="password"
        placeholder="Senha do arquivo"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  );

  if (props.mode === "embedded") {
    return (
      <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
        {toggle}
        {passwordField}
      </div>
    );
  }

  const standaloneProps = props;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) standaloneProps.onFileSelect(file);
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-border p-3">
      <Label htmlFor={`${idPrefix}-file`} className="text-[12.5px]">
        {standaloneProps.label}
      </Label>
      <Input
        key={standaloneProps.inputKey}
        id={`${idPrefix}-file`}
        type="file"
        accept={standaloneProps.accept}
        onChange={handleChange}
        disabled={disabled || standaloneProps.loading}
      />
      {toggle}
      {passwordField}
      {standaloneProps.loading && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {standaloneProps.loadingLabel ?? "Processando…"}
        </p>
      )}
      {standaloneProps.helperText && (
        <p className="text-[11.5px] font-medium text-muted-foreground">{standaloneProps.helperText}</p>
      )}
    </div>
  );
}
