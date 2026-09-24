// app/api/report-file/route.ts

/**
 * Same-origin pass-through for the Reports snapshot files in Firebase Storage
 * (reports/manifest.json, reports/{table}/{agency}/data.json.gz).
 *
 * Why: some corporate networks / browser extensions block
 * firebasestorage.googleapis.com, so the Reports tab failed with "Failed to
 * fetch" for those users. Routing the download through pluscoops.web.app means
 * anyone who can open Forecaster can load Reports.
 *
 * Security: this route has NO privileges of its own. It forwards the caller's
 * Firebase ID token to the Storage REST endpoint, so storage.rules decide
 * access exactly as for a direct download (per-agency scoping included). Only
 * the report paths below are allowed — it is not a general proxy.
 *
 * Every response carries `x-report-proxy: 1` so the client can tell this
 * route's answers (incl. a real 404 "not published") apart from the route
 * being unavailable, in which case it falls back to downloading directly.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "pluscoops.firebasestorage.app";
const ALLOWED_PATH =
  /^reports\/(manifest\.json|(mir|billing)\/[A-Za-z0-9 _-]{1,64}\/data\.json\.gz)$/;
const UPSTREAM_TIMEOUT_MS = 25_000;

function reply(status: number, error: string) {
  return NextResponse.json(
    { error },
    { status, headers: { "x-report-proxy": "1", "Cache-Control": "no-store" } }
  );
}

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!ALLOWED_PATH.test(path)) return reply(400, "Invalid report path.");

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^(Bearer|Firebase)\s+/i, "").trim();
  if (!token) return reply(401, "Missing sign-in token.");

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`,
      {
        headers: { Authorization: `Firebase ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      }
    );
  } catch (e) {
    return reply(502, `Storage unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the status through (403 = rules said no, 404 = not published).
    return reply(upstream.status || 502, `Storage responded ${upstream.status}.`);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      // Per-user data: never cache at the CDN or in shared caches.
      "Cache-Control": "private, no-store",
      "x-report-proxy": "1",
    },
  });
}
