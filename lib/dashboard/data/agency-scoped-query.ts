// lib/dashboard/data/agency-scoped-query.ts

import {
  collection,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { AgencyScope } from "../../format/agency-scope";

/**
 * Reads an agency-tagged dashboard collection (docs carry `_agency`, written by
 * the sync scripts) within the user's agency scope:
 *   - Admin → the whole collection.
 *   - Others     → only docs whose `_agency` is one of theirs, one equality
 *                  query per agency (there are only a handful). The `where`
 *                  clause is required: Firestore rules reject any query that
 *                  could return a doc the user may not read, and a plain
 *                  equality is the form the rules can always verify.
 *   - No agency  → nothing (no query issued).
 */
export async function fetchAgencyScopedDocs(
  collectionName: string,
  scope: AgencyScope
): Promise<QueryDocumentSnapshot[]> {
  const ref = collection(db, collectionName);
  if (scope.all) return (await getDocs(ref)).docs;
  if (scope.agencies.length === 0) return [];

  const snaps = await Promise.all(
    scope.agencies.map((a) => getDocs(query(ref, where("_agency", "==", a))))
  );
  return snaps.flatMap((s) => s.docs);
}
