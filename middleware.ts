// middleware.ts

import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware de protection des routes.
 *
 * Stratégie actuelle :
 * - Firebase Auth stocke la session dans localStorage (pas dans les cookies HTTP).
 * - Une vérification cookie côté serveur n'est donc pas fiable sans Firebase Admin SDK
 *   + session cookies custom (prévu en Phase 2 — hardening sécurité).
 * - La protection des routes est entièrement gérée côté client :
 *   - ProtectedLayout : redirige vers /auth/login si non authentifié
 *   - useUserProfile + guard dans chaque page admin : redirige si rôle insuffisant
 */

export function middleware(request: NextRequest) {
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