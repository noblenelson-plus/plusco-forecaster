// scripts/clear-mix.mjs — deletes every doc in mediaocean_investment_mix, then stops.
import admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "pluscoops",
});

const db = admin.firestore();
const col = db.collection("mediaocean_investment_mix");

let deleted = 0;
while (true) {
  const snap = await col.limit(500).get();
  if (snap.empty) break;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  deleted += snap.size;
  console.log(`deleted ${deleted}`);
}
console.log(`DONE — deleted ${deleted} docs`);
process.exit(0);