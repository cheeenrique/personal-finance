import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Next.js 16 renomeou `middleware.ts` -> `proxy.ts` (mesma função, ver
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * Toda rota é protegida por sessão, exceto `/login` (`10-AUTH.md`) e os
 * endpoints máquina-a-máquina (`api/telegram` autentica por secret header,
 * `api/cron/*` por CRON_SECRET) — esses ficam FORA do matcher abaixo, senão o
 * redirect pro `/login` devolve 307 e o Telegram/Vercel Cron nunca alcançam o
 * handler.
 */
const PUBLIC_ROUTES = ["/login"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);

  if (!isLoggedIn && !isPublicRoute(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api/auth|api/telegram|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
