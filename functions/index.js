// functions/index.js

/**
 * Cloud Functions for project pluscoops (deploy:
 * `firebase deploy --only functions`). The Next.js server function
 * (ssrpluscoops) and the BigQuery-export extensions are deployed separately
 * and are not part of this codebase.
 *
 * Keeps each client's derived `CL_MediaBox_Emails` (see mediabox-emails.js)
 * in step with:
 *   - MediaBox allocations (`mediabox_clients`, pushed live by MediaBox), and
 *   - the client's own `CL_MediaBox_IDs` (edited on the Clients page).
 * Writes only when the value changes, so the client trigger settles after its
 * own write.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { mediaboxEmailsUpdate, normalizeEmails, sameEmails } from "./mediabox-emails.js";

// Firestore triggers run in the database's region.
setGlobalOptions({ region: "northamerica-northeast2", maxInstances: 5 });

initializeApp();
const db = getFirestore();

/** A MediaBox client's allocations changed (or it was added / removed). */
export const onMediaboxClientWritten = onDocumentWritten("mediabox_clients/{mbClientId}", async (event) => {
  const before = event.data?.before.exists ? normalizeEmails(event.data.before.get("allocatedEmails")) : null;
  const after = event.data?.after.exists ? normalizeEmails(event.data.after.get("allocatedEmails")) : null;
  // A rename or metadata-only write changes nobody's access.
  if (before && after && sameEmails(before, after)) return;

  const { mbClientId } = event.params;
  const linked = await db.collection("clients").where("CL_MediaBox_IDs", "array-contains", mbClientId).get();
  let updated = 0;
  for (const doc of linked.docs) {
    const next = await mediaboxEmailsUpdate(db, doc.data());
    if (next) {
      await doc.ref.update({ CL_MediaBox_Emails: next });
      updated++;
    }
  }
  logger.info("mediabox_clients write", { mbClientId, linkedClients: linked.size, updated });
});

/** A client was saved: recompute when its MediaBox links (or the derived field) are off. */
export const onClientWritten = onDocumentWritten("clients/{clientId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const next = await mediaboxEmailsUpdate(db, after.data());
  if (!next) return;
  await after.ref.update({ CL_MediaBox_Emails: next });
  logger.info("client CL_MediaBox_Emails updated", { clientId: event.params.clientId, count: next.length });
});
