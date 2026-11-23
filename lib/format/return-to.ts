// lib/format/return-to.ts

/**
 * Where to send someone after sign-in. When a signed-out person opens a link
 * (e.g. a training video on /how-to), the protected layout sends them to
 * /auth/login?next=<that page>, and the login page returns them there.
 *
 * Only same-site paths are accepted ("/how-to?video=…"), never a full URL or a
 * protocol-relative "//host" — otherwise the parameter would be an open
 * redirect. Pure, no Firebase.
 */

export const RETURN_TO_PARAM = "next";

/** A safe in-app path from a raw `next` value, or "/" when it isn't one. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw === "/auth" || raw.startsWith("/auth/")) return "/";
  // Control characters (incl. tab/newline) can make browsers read a path as a URL.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  return raw;
}

/** The login URL that returns to `path` (a pathname + optional query). */
export function loginUrlFor(path: string): string {
  const target = safeReturnTo(path);
  return target === "/"
    ? "/auth/login"
    : `/auth/login?${RETURN_TO_PARAM}=${encodeURIComponent(target)}`;
}
