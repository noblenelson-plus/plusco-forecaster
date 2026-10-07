// lib/services/team-access-service.ts

/**
 * Team writes outside the client drawer (admin):
 * — the Clients page's "Team access" backfill recomputes every client's
 *   derived `CL_Team_Emails` (lib/format/client-team.ts). Client saves and CSV
 *   imports keep the array current on their own; this repairs clients saved
 *   before the field existed, or after GM_POD_EMAILS changes;
 * — Admin → Forecast Access edits collaborators in bulk.
 */

import { doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { fetchUsers } from "./user-service";
import {
  planTeamEmailsBackfill,
  type CollaboratorsUpdate,
  type TeamEmailsChange,
  type TeamEmailsPlan,
} from "../format/client-team";
import type { Client } from "../types/client.types";

const BATCH_SIZE = 500;

/** Dry run: what the backfill would change (no writes). */
export async function planTeamEmailsChanges(clients: Client[]): Promise<TeamEmailsPlan> {
  const users = await fetchUsers();
  return planTeamEmailsBackfill(clients, new Set(users.map((u) => u.email)));
}

/** Writes CL_Team_Emails (only that field) on the changed clients. */
export async function applyTeamEmailsChanges(changes: TeamEmailsChange[]): Promise<void> {
  for (let start = 0; start < changes.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const c of changes.slice(start, start + BATCH_SIZE)) {
      batch.update(doc(db, "clients", c.cl_id), { CL_Team_Emails: c.after });
    }
    await batch.commit();
  }
}

/**
 * Writes collaborator edits from Admin → Forecast Access (person ↔ clients
 * panels): CL_Collaborators and the recomputed CL_Team_Emails, together, so
 * the rules and the "my clients" query see the change at once.
 */
export async function applyCollaboratorsUpdates(updates: CollaboratorsUpdate[]): Promise<void> {
  const now = new Date().toISOString();
  for (let start = 0; start < updates.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const u of updates.slice(start, start + BATCH_SIZE)) {
      batch.update(doc(db, "clients", u.cl_id), {
        CL_Collaborators: u.CL_Collaborators,
        CL_Team_Emails: u.CL_Team_Emails,
        updatedAt: now,
      });
    }
    await batch.commit();
  }
}
