"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Wrapper fino sobre `next-themes` — mantém o Provider isolado num Client
 * Component próprio para o `RootLayout` (Server Component) poder importá-lo
 * sem precisar de `"use client"` na página inteira.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
