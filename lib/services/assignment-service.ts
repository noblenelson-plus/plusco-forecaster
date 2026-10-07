// lib/services/assignment-service.ts

/**
 * The clients a person may work on, derived from client teams.
 *
 * There are no per-user client lists any more: a client's team (BL, DL, GM
 * Pod, collaborators) is resolved into `CL_Team_Emails` on the client doc
 * (computeTeamEmails), and a person's clients are the ones listing their
 * email. Admins get every client. Dashboard grants widen what a dashboard
 * shows (lib/format/access.ts) but never what a person may edit.
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { UserProfile } from "./user-service";
import type { Client } from "../types/client.types";
import { isOnClientTeam } from "../format/client-team";
import { normalizeEmail } from "../format/email";

function toClient(d: { id: string; data: () => unknown }): Client {
  return { cl_id: d.id, ...(d.data() as Omit<Client, "cl_id">) };
}

/**
 * The full client docs of the person's team spaces: every client for an
 * admin, else the clients whose `CL_Team_Emails` lists their email (one
 * `array-contains` query — the shape the security rules can verify).
 *
 * Returns raw docs (hidden clients included, sorted by name) — callers apply
 * their own hidden-client filtering, which differs by surface (admins keep
 * hidden clients on the Clients page). Shared by use-accessible-clients,
 * forecast-selectors and the Clients page.
 */
export async function fetchAccessibleClients(
  profile: Pick<UserProfile, "email" | "disabled"> | null,
  isAdmin: boolean
): Promise<Client[]> {
  const byName = (a: Client, b: Client) => a.CL_Name.localeCompare(b.CL_Name);

  if (isAdmin) {
    const snap = await getDocs(collection(db, "clients"));
    return snap.docs.map(toClient).sort(byName);
  }

  const email = normalizeEmail(profile?.email);
  if (!email || profile?.disabled) return [];
  const snap = await getDocs(
    query(collection(db, "clients"), where("CL_Team_Emails", "array-contains", email))
  );
  return snap.docs.map(toClient).sort(byName);
}

// ─── Write scope (client-side mirror of the Firestore `canWriteClient` rule) ──

/**
 * Whether the person may WRITE a client's data (forecast, milestones, flags,
 * product tracking, Labs eligibility): admin, or on the client's team.
 * Mirrors `canWriteClient` in firestoreRules.txt so the UI can hide or skip
 * clients a write would be rejected for; the rules stay the enforcement.
 */
export function canWriteClient(
  client: Pick<Client, "CL_Team_Emails">,
  profile: Pick<UserProfile, "email" | "disabled"> | null,
  isAdmin: boolean
): boolean {
  if (profile?.disabled) return false;
  if (isAdmin) return true;
  return isOnClientTeam(profile?.email, client);
}

/** The subset of `clients` the person may write to (see canWriteClient). */
export function filterWritableClients(
  clients: Client[],
  profile: Pick<UserProfile, "email" | "disabled"> | null,
  isAdmin: boolean
): Client[] {
  return clients.filter((c) => canWriteClient(c, profile, isAdmin));
}
