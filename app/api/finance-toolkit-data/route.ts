// filepath: app/api/finance-toolkit-data/route.ts

/**
 * Serves the Finance Toolkit dataset (client revenue, staffing cost and
 * margins, plus media investment and complexity for the Staffing tab) to the people listed in lib/finance-toolkit/access.ts, and nobody
 * else. The dataset lives in lib/server/ and is only imported here, so it is
 * never part of a browser bundle or a static Hosting file.
 *
 * The caller sends their Firebase ID token; it is verified with the same
 * accounts:lookup check the Reports route uses (lib/server/report-access.ts).
 */

import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/server/report-access";
import { FINANCE_TOOLKIT_DATA } from "@/lib/server/finance-toolkit-data";
import { STAFFING_DATA } from "@/lib/server/staffing-data";
import { canViewFinanceToolkit } from "@/lib/finance-toolkit/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function reply(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function GET(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, "Missing sign-in token.");

  let caller: Awaited<ReturnType<typeof verifyIdToken>>;
  try {
    caller = await verifyIdToken(token);
  } catch (e) {
    console.error("finance-toolkit-data: token check failed:", e);
    return reply(502, "Could not verify sign-in. Try again.");
  }
  if (!caller) return reply(401, "Invalid or expired sign-in token.");
  if (!caller.emailVerified || !canViewFinanceToolkit(caller.email)) return reply(403, "Not available for this account.");

  return NextResponse.json({ ...FINANCE_TOOLKIT_DATA, staffing: STAFFING_DATA }, { headers: NO_STORE });
}
