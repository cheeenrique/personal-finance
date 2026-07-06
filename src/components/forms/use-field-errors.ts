"use client";

import { useState } from "react";

/**
 * Estado de erros de campo (validação client-side de presença) compartilhado
 * por todo formulário de criar/editar entidade — cada form monta seu próprio
 * objeto de erros no submit (campos diferem por formulário) e usa
 * `clearFieldError` pra limpar o erro de um campo específico assim que o
 * usuário volta a editá-lo.
 */
export function useFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function clearFieldError(field: string) {
    setFieldErrors((previous) => {
      if (!(field in previous)) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  return { fieldErrors, setFieldErrors, clearFieldError } as const;
}
