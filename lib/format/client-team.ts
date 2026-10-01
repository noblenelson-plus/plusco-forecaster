// lib/format/client-team.ts

/**
 * Client team → client access, as pure functions (no Firebase).
 *
 * A client's team — its Business Lead, Digital Lead and the GM of its GM Pod —
 * automatically has access to it (`users.assignedClients`). The rules, agreed
 * with the team:
 *   - Being put on a client's team grants that client: the whole team of a
 *     new client, and on an existing client only a newly added member (saving
 *     other fields grants nothing). Someone who hasn't signed in yet gets a
 *     pending invite instead, applied on their first sign-in.
 *   - A Viewer on a team is upgraded to Business Lead (an invite created here
 *     is Business Lead). Exec and Admin roles are never changed; Admins see
 *     every client already, so they are left alone; revoked users too.
 *   - Replacing a team member removes the client from the person replaced
 *     (unless they are still on that client's team in another role).
 *
 * team-access-service.ts applies a plan; access-sync.ts keeps team access
 * through an Access-sheet full sync.
 */

import { GM_POD_EMAILS, type ClientGMPod } from "../constants/client.constants";
import type { Client } from "../types/client.types";
import type { UserRole } from "../types/user.types";

export type ClientTeamFields = Pick<
  Client,
  "cl_id" | "CL_Business_Lead" | "CL_Digital_Lead" | "GM_Pod"
>;

const normKey = (v: string) => {
  const s = v.trim();
  return s.includes("@") ? s.toLowerCase() : s;
};

/**
 * The client's team as user keys: lowercased emails (BL / DL values and the
 * GM Pod's GM accounts), or a raw uid for older BL / DL values stored as uids.
 */
export function clientTeamKeys(
  client: Pick<Client, "CL_Business_Lead" | "CL_Digital_Lead" | "GM_Pod">
): string[] {
  const keys = new Set<string>();
  for (const v of [client.CL_Business_Lead, client.CL_Digital_Lead]) {
    if (v && v.trim()) keys.add(normKey(v));
  }
  for (const e of GM_POD_EMAILS[client.GM_Pod as ClientGMPod] ?? []) {
    keys.add(e.toLowerCase());
  }
  return [...keys];
}

/** email → the clients that person is on the team of (for the Access sheet). */
export function teamClientsByEmail(clients: ClientTeamFields[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const c of clients) {
    for (const key of clientTeamKeys(c)) {
      if (!key.includes("@")) continue; // uid-valued legacy field: no email
      let set = out.get(key);
      if (!set) out.set(key, (set = new Set()));
      set.add(c.cl_id);
    }
  }
  return out;
}

export interface TeamChange {
  /** The client as saved. */
  after: ClientTeamFields;
  /** The client before the save (null for a new client / unknown → grant only). */
  before?: ClientTeamFields | null;
}

export interface TeamUser {
  uid: string;
  email: string;
  role: UserRole;
  assignedClients: string[];
  disabled?: boolean;
}

export interface TeamInvite {
  email: string;
  role: UserRole;
  assignedClients: string[];
}

export interface TeamUserWrite {
  uid: string;
  email: string;
  /** The user's full assignedClients after the change. */
  assignedClients: string[];
  /** Set when a Viewer is upgraded. */
  role?: "BUSINESS_LEAD";
  added: string[];
  removed: string[];
}

export interface TeamInviteWrite {
  email: string;
  role: UserRole;
  assignedClients: string[];
  isNew: boolean;
  added: string[];
  removed: string[];
}

export interface TeamAccessPlan {
  users: TeamUserWrite[];
  invites: TeamInviteWrite[];
}

const sorted = (s: Iterable<string>) => [...new Set(s)].sort();

/** The writes that bring users / invites in line with the given team changes. */
export function planTeamAccess(input: {
  changes: TeamChange[];
  users: TeamUser[];
  invites: TeamInvite[];
}): TeamAccessPlan {
  const byEmail = new Map(input.users.map((u) => [u.email.trim().toLowerCase(), u]));
  const byUid = new Map(input.users.map((u) => [u.uid, u]));
  const invitesByEmail = new Map(
    input.invites.map((i) => [i.email.trim().toLowerCase(), i])
  );

  // Per target (user uid, or invite email): clients to add / remove.
  const adds = new Map<string, Set<string>>();
  const removes = new Map<string, Set<string>>();
  const bump = (m: Map<string, Set<string>>, k: string, id: string) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(id);
  };
  // "u:<uid>" for a user, "i:<email>" for someone with no account yet.
  const target = (key: string): string | null => {
    const user = key.includes("@") ? byEmail.get(key) : byUid.get(key);
    if (user) return `u:${user.uid}`;
    return key.includes("@") ? `i:${key}` : null; // unknown uid: nobody to grant
  };

  for (const { after, before } of input.changes) {
    const now = new Set(clientTeamKeys(after));
    // An existing client grants only members newly put on its team: saving
    // other fields never re-grants the current team (access is left as set).
    const was = new Set(before ? clientTeamKeys(before) : []);
    for (const key of now) {
      if (was.has(key)) continue;
      const t = target(key);
      if (t) bump(adds, t, after.cl_id);
    }
    for (const key of was) {
      if (now.has(key)) continue;
      const t = target(key);
      if (t) bump(removes, t, after.cl_id);
    }
  }

  const users: TeamUserWrite[] = [];
  const invites: TeamInviteWrite[] = [];
  for (const t of new Set([...adds.keys(), ...removes.keys()])) {
    const add = adds.get(t) ?? new Set<string>();
    const remove = removes.get(t) ?? new Set<string>();

    if (t.startsWith("u:")) {
      const user = byUid.get(t.slice(2))!;
      if (user.role === "ADMIN" || user.disabled) continue;
      const current = new Set(user.assignedClients);
      const added = sorted([...add].filter((id) => !current.has(id)));
      const removed = sorted([...remove].filter((id) => current.has(id)));
      const promote = user.role === "VIEWER" && add.size > 0;
      if (!added.length && !removed.length && !promote) continue;
      users.push({
        uid: user.uid,
        email: user.email,
        assignedClients: sorted(
          [...current, ...added].filter((id) => !removed.includes(id))
        ),
        ...(promote ? { role: "BUSINESS_LEAD" as const } : {}),
        added,
        removed,
      });
    } else {
      const email = t.slice(2);
      const existing = invitesByEmail.get(email);
      if (!existing && add.size === 0) continue; // nothing to revoke
      const current = new Set(existing?.assignedClients ?? []);
      const added = sorted([...add].filter((id) => !current.has(id)));
      const removed = sorted([...remove].filter((id) => current.has(id)));
      // New invites are Business Lead; an existing Viewer invite is upgraded
      // only when this grants something (a removal never changes the role).
      const role: UserRole = !existing
        ? "BUSINESS_LEAD"
        : existing.role === "VIEWER" && add.size > 0
          ? "BUSINESS_LEAD"
          : existing.role;
      if (existing && !added.length && !removed.length && role === existing.role) continue;
      invites.push({
        email,
        role,
        assignedClients: sorted(
          [...current, ...added].filter((id) => !removed.includes(id))
        ),
        isNew: !existing,
        added,
        removed,
      });
    }
  }
  return { users, invites };
}
