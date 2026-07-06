import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Next.js 16 renomeou `middleware.ts` -> `proxy.ts` (mesma função, ver
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * Toda rota é protegida, exceto `/login` (`10-AUTH.md`).
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
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
