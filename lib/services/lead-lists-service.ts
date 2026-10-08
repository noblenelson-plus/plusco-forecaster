// lib/services/lead-lists-service.ts

/**
 * Firestore service — the agreed lists offered in the client drawer's
 * Business Lead and Digital Lead dropdowns: `config/business_leads` and
 * `config/digital_leads`, each `{ emails: string[] }` (lowercase). Admins add
 * to them from the drawer ("Add a …"). Read by every signed-in user, written
 * by admins (the `config` rules).
 */

import { arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normalizeEmail, normalizeEmailList } from "../format/email";

export type LeadKind = "business" | "digital";

const LIST_DOC: Record<LeadKind, string> = {
  business: "business_leads",
  digital: "digital_leads",
};

/** The list, sorted. A missing doc is an empty list. */
export async function fetchLeadList(kind: LeadKind): Promise<string[]> {
  const snap = await getDoc(doc(db, "config", LIST_DOC[kind]));
  return normalizeEmailList((snap.data()?.emails as string[] | undefined) ?? []);
}

/** Adds one person to the list (admin). */
export async function addToLeadList(kind: LeadKind, email: string): Promise<void> {
  await setDoc(
    doc(db, "config", LIST_DOC[kind]),
    { emails: arrayUnion(normalizeEmail(email)) },
    { merge: true }
  );
}
