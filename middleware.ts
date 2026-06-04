// middleware.ts

import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware de protection des routes.
 *
 * Stratégie :
 * - Les routes /admin/* sont protégées côté serveur.
 * - Firebase Auth étant client-side, on vérifie la présence du cookie de session
 *   Firebase (__session ou firebase:authUser) comme signal d'authentification.
 * - La vérification du rôle ADMIN reste côté client (useUserProfile + redirect).
 *   Une vérification serveur complète nécessiterait Firebase Admin SDK + session cookies
 *   custom, ce qui sera ajouté en Phase 2 (hardening sécurité).
 *
 * Routes protégées :
 * - /admin/* → redirige vers /auth/login si aucun cookie d'auth détecté
 * - Toutes les autres routes protégées → gérées par ProtectedLayout côté client
 */

// Cookie keys Firebase peut écrire selon la config
const FIREBASE_AUTH_COOKIE_KEYS = [
  "__session",
  "firebase:authUser",
];

function hasAuthCookie(request: NextRequest): boolean {
  return FIREBASE_AUTH_COOKIE_KEYS.some((key) =>
    request.cookies.has(key)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /admin/* routes
  if (pathname.startsWith("/admin")) {
    if (!hasAuthCookie(request)) {
      const loginUrl = new URL("/auth/login", request.url);
      // Preserve the original destination for post-login redirect
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (svg, png, etc.)
     * - /auth/* (login page itself)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)|auth).*)",
  ],
};