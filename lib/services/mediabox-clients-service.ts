// lib/services/mediabox-clients-service.ts

/**
 * Firestore service — `mediabox_clients/{mbClientId}`: the MediaBox / Planner
 * clients and who is allocated to them, pushed live by MediaBox (written only
 * by MediaBox's function — never by the app). The client drawer lists them so
 * an admin links a Forecaster client to its MediaBox client(s) by name
 * (CL_MediaBox_IDs) instead of typing ids. Admin-only read (the docs list
 * staff emails).
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

/** One MediaBox client, as the picker needs it. */
export interface MediaboxClientOption {
  /** The MediaBox client id (what CL_MediaBox_IDs stores). */
  id: string;
  name: string;
  /** People allocated to it in MediaBox. */
  allocatedCount: number;
}

/** Every MediaBox client, sorted by name (admin). */
export async function fetchMediaboxClients(): Promise<MediaboxClientOption[]> {
  const snap = await getDocs(collection(db, "mediabox_clients"));
  return snap.docs
    .map((d) => {
      const data = d.data() as { name?: unknown; allocatedEmails?: unknown };
      return {
        id: d.id,
        name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : d.id,
        allocatedCount: Array.isArray(data.allocatedEmails) ? data.allocatedEmails.length : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
