import * as React from "react"

import { cn } from "@/lib/utils/index"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Mesmo ajuste de `ui/input.tsx`/`ui/select.tsx`: `border-border`/`bg-input`
        // no lugar de `border-input`/`bg-transparent` (kit genérico não adaptado).
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-border bg-input px-3 py-2 text-base font-medium transition-colors outline-none placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
