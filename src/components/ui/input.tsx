import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils/index"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // `border-border`/`bg-input` (não `border-input`/`bg-transparent`) — mesmo
        // ajuste de `ui/select.tsx`: `border-input` é quase invisível (pensado só
        // pra fundo, não borda) e o kit genérico nunca foi adaptado aos tokens
        // deste projeto. Altura 40px (design/PERSONAL_FINANCE_DS_HANDOFF.md,
        // "Input/TextField" > "Height: 40–44px, padrão 40px").
        "h-10 w-full min-w-0 rounded-lg border border-border bg-input px-3 py-1 text-base font-medium transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
