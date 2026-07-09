// app/api/mediabox-refresh/route.ts

/**
 * Server route that forwards a "refresh this client/year" request to the
 * MediaBox aggregation function in the other Firebase project. It exists so the
 * shared secret and the function URL never touch the browser bundle.
 *
 * The browser calls this same-origin (see `triggerMediaboxRefresh`); the route
 * attaches the secret header and proxies the call. The operation only triggers
 * a recompute of read-only totals, so it is low-risk; the data itself is
 * protected by Firestore rules.
 *
 * Required server env:
 *   MEDIABOX_REFRESH_URL     — the deployed onRequest function URL
 *   MEDIABOX_REFRESH_SECRET  — shared secret, matches the MediaBox secret
 */

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const url = process.env.MEDIABOX_REFRESH_URL;
  const secret = process.env.MEDIABOX_REFRESH_SECRET;

  if (!url || !secret) {
    return NextResponse.json(
      { error: "MediaBox refresh is not configured on the server." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mediabox-secret": secret,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    // Pass the upstream status and payload straight through.
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to reach MediaBox.",
      },
      { status: 502 }
    );
  }
}
