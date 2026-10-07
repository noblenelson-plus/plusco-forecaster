// lib/services/digital-leads-service.ts

/**
 * Firestore service — `config/digital_leads`: the people offered in the client
 * drawer's Digital Lead dropdown (`{ emails: string[] }`, lowercase). Admins
 * add to it from the drawer ("Add a Digital Lead"). Read by every signed-in
 * user, written by admins (the `config` rules).
 */

import { arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normalizeEmail, normalizeEmailList } from "../format/email";

const DIGITAL_LEADS_DOC = doc(db, "config", "digital_leads");

/** The Digital Lead list, sorted. A missing doc is an empty list. */
export async function fetchDigitalLeads(): Promise<string[]> {
  const snap = await getDoc(DIGITAL_LEADS_DOC);
  return normalizeEmailList((snap.data()?.emails as string[] | undefined) ?? []);
}

/** Adds one person to the list (admin). */
export async function addDigitalLead(email: string): Promise<void> {
  await setDoc(DIGITAL_LEADS_DOC, { emails: arrayUnion(normalizeEmail(email)) }, { merge: true });
}
