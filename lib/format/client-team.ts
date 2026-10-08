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

// ─── Roles per client (Admin → Forecast Access) ──────────────────────────────

/** The seat a person holds on a client's team. */
export type TeamRole = "GM" | "BL" | "DL" | "COLLABORATOR";

export const TEAM_ROLES: TeamRole[] = ["GM", "BL", "DL", "COLLABORATOR"];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  GM: "GM",
  BL: "Business Lead",
  DL: "Digital Lead",
  COLLABORATOR: "Collaborator",
};

export const TEAM_ROLE_SHORT: Record<TeamRole, string> = {
  GM: "GM",
  BL: "BL",
  DL: "DL",
  COLLABORATOR: "Collab.",
};

/** Every (email, role) seat on the client's team, from its source fields. */
export function teamSeats(client: TeamEmailFields): { email: string; role: TeamRole }[] {
  const seats: { email: string; role: TeamRole }[] = [];
  const push = (value: string | undefined | null, role: TeamRole) => {
    const e = normalizeEmail(value);
    if (isValidEmail(e)) seats.push({ email: e, role });
  };
  for (const e of GM_POD_EMAILS[client.GM_Pod as ClientGMPod] ?? []) push(e, "GM");
  push(client.CL_Business_Lead, "BL");
  push(client.CL_Digital_Lead, "DL");
  for (const e of client.CL_Collaborators ?? []) push(e, "COLLABORATOR");
  return seats;
}

/**
 * email → (cl_id → roles held on that client). A person with several seats on
 * one client (e.g. BL and collaborator) lists each role once.
 */
export function teamMemberships(
  clients: (TeamEmailFields & Pick<Client, "cl_id">)[]
): Map<string, Map<string, TeamRole[]>> {
  const out = new Map<string, Map<string, TeamRole[]>>();
  for (const c of clients) {
    for (const { email, role } of teamSeats(c)) {
      let byClient = out.get(email);
      if (!byClient) out.set(email, (byClient = new Map()));
      const roles = byClient.get(c.cl_id) ?? [];
      if (!roles.includes(role)) byClient.set(c.cl_id, [...roles, role]);
    }
  }
  return out;
}

/** A collaborator edit on one client, with its recomputed CL_Team_Emails. */
export interface CollaboratorsUpdate {
  cl_id: string;
  CL_Collaborators: string[];
  CL_Team_Emails: string[];
}

/** The client with `collaborators` as its collaborator list. */
export function collaboratorsUpdate(
  client: TeamEmailFields & Pick<Client, "cl_id">,
  collaborators: string[]
): CollaboratorsUpdate {
  const list = normalizeEmailList(collaborators);
  return {
    cl_id: client.cl_id,
    CL_Collaborators: list,
    CL_Team_Emails: computeTeamEmails({ ...client, CL_Collaborators: list }),
  };
}

/** Adds (`on`) or removes the person from the client's collaborators. */
export function toggleCollaborator(
  client: TeamEmailFields & Pick<Client, "cl_id">,
  email: string,
  on: boolean
): CollaboratorsUpdate {
  const e = normalizeEmail(email);
  const current = normalizeEmailList(client.CL_Collaborators ?? []);
  return collaboratorsUpdate(client, on ? [...current, e] : current.filter((x) => x !== e));
}

// ─── Agency-wide collaborators ────────────────────────────────────────────────

/**
 * People allocated to most of an agency (senior staff given broad access):
 * a collaborator on at least `share` of the clients of an agency that has
 * `minClients` or more. The client drawer hides them from its Collaborators
 * list so it shows the client's own collaborators; their access is unchanged.
 * The size floor keeps a one-client agency (Showroom) from marking everyone.
 */
export function agencyWideCollaborators(
  clients: Pick<Client, "CL_Agency" | "CL_Collaborators">[],
  { share = 0.5, minClients = 10 }: { share?: number; minClients?: number } = {}
): Set<string> {
  const size = new Map<string, number>();
  const count = new Map<string, Map<string, number>>();
  for (const c of clients) {
    size.set(c.CL_Agency, (size.get(c.CL_Agency) ?? 0) + 1);
    for (const e of normalizeEmailList(c.CL_Collaborators ?? [])) {
      if (!count.has(c.CL_Agency)) count.set(c.CL_Agency, new Map());
      const m = count.get(c.CL_Agency)!;
      m.set(e, (m.get(e) ?? 0) + 1);
    }
  }
  const wide = new Set<string>();
  for (const [agency, m] of count) {
    const n = size.get(agency) ?? 0;
    if (n < minClients) continue;
    for (const [e, k] of m) if (k / n >= share) wide.add(e);
  }
  return wide;
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
