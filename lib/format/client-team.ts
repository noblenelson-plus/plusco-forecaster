// lib/format/client-team.ts

/**
 * Client team → client access, as pure functions (no Firebase).
 *
 * A client's team is its Business Lead, Digital Lead, the GM accounts of its
 * GM Pod (GM_POD_EMAILS) and its collaborators. Everyone on it may read and
 * edit the client (lib/format/access.ts). The team is resolved into the
 * derived `CL_Team_Emails` array on the client doc, which the security rules
 * and the "my clients" query read — so it is recomputed on every save that
 * touches the team (client-service.ts), and `planTeamEmailsBackfill` brings
 * every client back in line (e.g. after GM_POD_EMAILS changes).
 */

import { GM_POD_EMAILS, type ClientGMPod } from "../constants/client.constants";
import type { Client } from "../types/client.types";
import { isValidEmail, normalizeEmail, normalizeEmailList } from "./email";

export type TeamEmailFields = Pick<
  Client,
  "CL_Business_Lead" | "CL_Digital_Lead" | "GM_Pod" | "CL_Collaborators"
>;

/**
 * The client's `CL_Team_Emails`: BL + DL + the GM Pod's accounts
 * (GM_POD_EMAILS) + collaborators — normalized, deduped, sorted. Non-email
 * values (empty, legacy uids) are dropped; `invalidTeamValues` lists them.
 * Recompute on every client save: the rules and the "my clients" query trust
 * this array.
 */
export function computeTeamEmails(client: TeamEmailFields): string[] {
  return normalizeEmailList([
    client.CL_Business_Lead,
    client.CL_Digital_Lead,
    ...(GM_POD_EMAILS[client.GM_Pod as ClientGMPod] ?? []),
    ...(client.CL_Collaborators ?? []),
  ]);
}

/** Non-blank BL / DL / collaborator values that are not emails (for logs). */
export function invalidTeamValues(client: TeamEmailFields): string[] {
  return [client.CL_Business_Lead, client.CL_Digital_Lead, ...(client.CL_Collaborators ?? [])]
    .filter((v): v is string => !!v && !!v.trim() && !isValidEmail(v));
}

/** True when the (normalized) email is in the client's stored CL_Team_Emails. */
export function isOnClientTeam(
  email: string | null | undefined,
  client: Pick<Client, "CL_Team_Emails">
): boolean {
  const e = normalizeEmail(email);
  return !!e && (client.CL_Team_Emails ?? []).includes(e);
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

export interface TeamEmailsChange {
  cl_id: string;
  name: string;
  /** The recomputed CL_Team_Emails. */
  after: string[];
  added: string[];
  removed: string[];
}

export interface TeamEmailsPlan {
  /** Clients whose stored CL_Team_Emails differs from the recomputed one. */
  changes: TeamEmailsChange[];
  /** Team emails with no users row (they can't be picked in the drawer). */
  notUsers: string[];
  /** Clients with BL / DL / collaborator values that are not emails. */
  invalid: { cl_id: string; name: string; values: string[] }[];
}

/** Compares every client's stored team emails with the recomputed ones. */
export function planTeamEmailsBackfill(
  clients: (TeamEmailFields & Pick<Client, "cl_id" | "CL_Name" | "CL_Team_Emails">)[],
  userEmails: ReadonlySet<string>
): TeamEmailsPlan {
  const changes: TeamEmailsChange[] = [];
  const notUsers = new Set<string>();
  const invalid: TeamEmailsPlan["invalid"] = [];
  for (const c of clients) {
    const after = computeTeamEmails(c);
    const before = new Set(c.CL_Team_Emails ?? []);
    const added = after.filter((e) => !before.has(e));
    const removed = [...before].filter((e) => !after.includes(e)).sort();
    if (added.length || removed.length || !c.CL_Team_Emails) {
      changes.push({ cl_id: c.cl_id, name: c.CL_Name, after, added, removed });
    }
    for (const e of after) if (!userEmails.has(e)) notUsers.add(e);
    const bad = invalidTeamValues(c);
    if (bad.length) invalid.push({ cl_id: c.cl_id, name: c.CL_Name, values: bad });
  }
  return { changes, notUsers: [...notUsers].sort(), invalid };
}
