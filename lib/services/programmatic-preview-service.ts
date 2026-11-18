// lib/services/programmatic-preview-service.ts

/**
 * Reads the Programmatic (preview) dataset: `programmatic_preview/meta` plus
 * its `rows_NNN` docs, each row stored as a JSON string of the columns listed
 * in meta.columns (Firestore can't hold nested arrays). Written by
 * scripts/build-programmatic-preview.mjs; readable only by the viewers in
 * lib/programmatic/access.ts (Firestore rule).
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { MirRow, ProgRow, ProgrammaticPreviewData } from "../programmatic/programmatic.types";

const COLLECTION = "programmatic_preview";

function toObject<T>(columns: string[], json: string): T {
  const values = JSON.parse(json) as unknown[];
  return Object.fromEntries(columns.map((c, i) => [c, values[i]])) as T;
}

/** The whole dataset, or null when it has not been built yet. */
export async function fetchProgrammaticPreview(): Promise<ProgrammaticPreviewData | null> {
  const metaSnap = await getDoc(doc(db, COLLECTION, "meta"));
  if (!metaSnap.exists()) return null;
  const meta = metaSnap.data();
  const columns: string[] = meta.columns ?? [];
  const mirColumns: string[] = meta.mirColumns ?? ["dsp", "month", "client", "mirCad"];
  const docCount: number = meta.docCount ?? 0;

  const chunks = await Promise.all(
    Array.from({ length: docCount }, (_, i) => getDoc(doc(db, COLLECTION, `rows_${String(i).padStart(3, "0")}`)))
  );
  const rows: ProgRow[] = chunks.flatMap((s) => ((s.data()?.rows as string[]) ?? []).map((r) => toObject<ProgRow>(columns, r)));
  const mir: MirRow[] = ((meta.mir as string[]) ?? []).map((r) => toObject<MirRow>(mirColumns, r));
  const infoColumns: string[] = meta.clientInfoColumns ?? ["client", "agency", "region", "gm"];
  const clientInfo: ProgrammaticPreviewData["clientInfo"] = {};
  for (const r of (meta.clientInfo as string[]) ?? []) {
    const o = toObject<{ client: string; agency: string; region: string; gm: string }>(infoColumns, r);
    clientInfo[o.client] = { agency: o.agency, region: o.region, gm: o.gm };
  }

  return {
    generatedAt: meta.generatedAt ?? "",
    year: meta.year ?? new Date().getFullYear(),
    months: meta.months ?? [],
    usdRate: meta.fx?.USD?.rate ?? null,
    usdBasis: meta.fx?.USD?.basis ?? null,
    rows,
    mir,
    clientInfo,
  };
}
