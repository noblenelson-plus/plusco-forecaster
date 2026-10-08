// lib/services/assignment-service.ts

/**
 * The clients a person may work on and read.
 *
 * There are no per-user client lists: a client's team (BL, DL, GM Pod,
 * collaborators) is resolved into `CL_Team_Emails` on the client doc
 * (computeTeamEmails), and a person's team clients are the ones listing their
 * email. A Forecaster grant with "edit" adds the clients of its agencies ×
 * regions. Admins get every client. What else a person may READ (their
 * domain's agencies, their grants) comes from lib/format/access.ts.
 */

import { collection, getDocs, query, where, type QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import type { UserProfile } from "./user-service";
import type { Client } from "../types/client.types";
import type { GrantScope } from "../types/access.types";
import { isOnClientTeam } from "../format/client-team";
import { normalizeEmail } from "../format/email";
import { grantCoversClient, type ClientQuerySpec } from "../format/access";

function toClient(d: { id: string; data: () => unknown }): Client {
  return { cl_id: d.id, ...(d.data() as Omit<Client, "cl_id">) };
}

const byName = (a: Client, b: Client) => a.CL_Name.localeCompare(b.CL_Name);

/** Runs `clients` queries (equality on agency / region — the shapes the rules verify). */
async function runClientQueries(specs: ClientQuerySpec[]): Promise<Client[]> {
  const ref = collection(db, "clients");
  const results = await Promise.all(
    specs.map((s) => {
      const where_: QueryConstraint[] = [];
      if (s.agency) where_.push(where("CL_Agency", "==", s.agency));
      if (s.region) where_.push(where("CL_Business_Unit_Region", "==", s.region));
      return getDocs(where_.length ? query(ref, ...where_) : ref).then((snap) => snap.docs.map(toClient));
    })
  );
  return results.flat();
}

function dedupe(clients: Client[]): Client[] {
  const byId = new Map<string, Client>();
  for (const c of clients) byId.set(c.cl_id, c);
  return [...byId.values()].sort(byName);
}

/**
 * The full client docs of the person's team spaces: every client for an
 * admin, else the clients whose `CL_Team_Emails` lists their email (one
 * `array-contains` query — the shape the security rules can verify), plus
 * those of an edit grant (`editQueries`, editableClientQueries).
 *
 * Returns raw docs (hidden clients included, sorted by name) — callers apply
 * their own hidden-client filtering, which differs by surface (admins keep
 * hidden clients on the Clients page). Shared by use-accessible-clients,
 * forecast-selectors and the Clients page.
 */
export async function fetchAccessibleClients(
  profile: Pick<UserProfile, "email" | "disabled"> | null,
  isAdmin: boolean,
  editQueries: ClientQuerySpec[] = []
): Promise<Client[]> {
  if (isAdmin) {
    const snap = await getDocs(collection(db, "clients"));
    return snap.docs.map(toClient).sort(byName);
  }

  const email = normalizeEmail(profile?.email);
  if (!email || profile?.disabled) return [];
  const [team, granted] = await Promise.all([
    getDocs(query(collection(db, "clients"), where("CL_Team_Emails", "array-contains", email))).then((s) =>
      s.docs.map(toClient)
    ),
    runClientQueries(editQueries),
  ]);
  return dedupe([...team, ...granted]);
}

/**
 * Every client the person may READ: their team clients plus `queries`
 * (readableClientQueries: their domain's agencies and their grants). Admin →
 * all. Deduped, sorted by name, hidden clients included (callers filter).
 * Feeds the dashboard, whose tabs then narrow it (tabCoversClient).
 */
export async function fetchReadableClients(
  profile: Pick<UserProfile, "email" | "disabled"> | null,
  isAdmin: boolean,
  queries: ClientQuerySpec[]
): Promise<Client[]> {
  if (isAdmin) return fetchAccessibleClients(profile, true);
  if (!profile || profile.disabled) return [];
  const [team, others] = await Promise.all([fetchAccessibleClients(profile, false), runClientQueries(queries)]);
  return dedupe([...team, ...others]);
}

// ─── Write scope (client-side mirror of the Firestore `canWriteClient` rule) ──

/**
 * Whether the person may WRITE a client's data (forecast, milestones, flags,
 * product tracking, Labs eligibility): admin, on the client's team, or a
 * Forecaster edit grant covering it (`editGrant`). Mirrors `canWriteClient`
 * in firestoreRules.txt so the UI can hide or skip clients a write would be
 * rejected for; the rules stay the enforcement.
 */
export function canWriteClient(
  client: Pick<Client, "CL_Team_Emails" | "CL_Agency" | "CL_Business_Unit_Region">,
  profile: Pick<UserProfile, "email" | "disabled"> | null,
  isAdmin: boolean,
  editGrant: GrantScope | null = null
): boolean {
  if (profile?.disabled) return false;
  if (isAdmin) return true;
  return isOnClientTeam(profile?.email, client) || grantCoversClient(editGrant, client);
}

/** The subset of `clients` the person may write to (see canWriteClient). */
export function filterWritableClients(
  clients: Client[],
  profile: Pick<UserProfile, "email" | "disabled"> | null,
  isAdmin: boolean,
  editGrant: GrantScope | null = null
): Client[] {
  return clients.filter((c) => canWriteClient(c, profile, isAdmin, editGrant));
}
