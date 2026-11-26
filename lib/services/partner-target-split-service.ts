// lib/services/partner-target-split-service.ts

/**
 * Admin overrides of the client split of partner targets
 * (`partner_target_splits/{year}`): { overrides: { [partnerKey]: { [clientId]: share 0..1 } } }.
 * Everything not overridden follows the forecast / MIR shares
 * (lib/format/partner-target-split.ts). Read by any company user, written by admins.
 */

import { doc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "partner_target_splits";

export type SplitOverrides = Record<string, Record<string, number>>;

export function subscribeToSplitOverrides(
  year: number,
  onData: (overrides: SplitOverrides) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, String(year)),
    (snap) => {
      const raw = (snap.exists() ? snap.data().overrides : null) ?? {};
      const out: SplitOverrides = {};
      for (const [partner, byClient] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
        const clean: Record<string, number> = {};
        for (const [clientId, v] of Object.entries(byClient ?? {})) {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 1) clean[clientId] = n;
        }
        if (Object.keys(clean).length) out[partner] = clean;
      }
      onData(out);
    },
    (err) => onError?.(err)
  );
}

/** Replace one partner's overrides for the year (empty = back to automatic shares). */
export async function saveSplitOverrides(
  year: number,
  partnerKey: string,
  byClient: Record<string, number>,
  all: SplitOverrides,
  email: string | null
): Promise<void> {
  for (const v of Object.values(byClient)) {
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error("Shares must be between 0% and 100%.");
  }
  const total = Object.values(byClient).reduce((s, v) => s + v, 0);
  if (total > 1.0001) throw new Error(`Overrides add up to ${(total * 100).toFixed(1)}% — more than 100%.`);
  const next: SplitOverrides = { ...all };
  if (Object.keys(byClient).length) next[partnerKey] = byClient;
  else delete next[partnerKey];
  // Whole document replaced so removed overrides disappear (setDoc merge would keep them).
  await setDoc(doc(db, COLLECTION, String(year)), { year, overrides: next, updatedAt: serverTimestamp(), updatedBy: email ?? null });
}
