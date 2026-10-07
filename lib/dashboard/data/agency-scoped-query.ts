// lib/dashboard/data/agency-scoped-query.ts

import {
  collection,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
import { scopeQueryAgencies, type AgencyScope } from "../../format/agency-scope";

/**
 * Reads an agency-tagged dashboard collection (docs carry `_agency`, written by
 * the sync scripts) within a dashboard's agency scope (useAgencyScope):
 *   - Everything, "_unassigned" included (admin, Global mode) → the whole
 *     collection.
 *   - Otherwise → only docs whose `_agency` is in scope, one equality query
 *     per agency (there are only a handful). The `where` clause is required:
 *     Firestore rules reject any query that could return a doc the user may
 *     not read, and a plain equality is the form the rules can always verify.
 *   - No agency → nothing (no query issued).
 */
export async function fetchAgencyScopedDocs(
  collectionName: string,
  scope: AgencyScope
): Promise<QueryDocumentSnapshot[]> {
  const ref = collection(db, collectionName);
  const agencies = scopeQueryAgencies(scope);
  if (agencies === null) return (await getDocs(ref)).docs;
  if (agencies.length === 0) return [];

  const snaps = await Promise.all(
    agencies.map((a) => getDocs(query(ref, where("_agency", "==", a))))
  );
  return snaps.flatMap((s) => s.docs);
}
