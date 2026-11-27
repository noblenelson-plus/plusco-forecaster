// lib/format/agency-groups.ts

/**
 * The agency × BU region columns of the Labs-target tracking view (the
 * investments team's sheet): CM ROC, MEK ROC, CM MTL/QC, Jungle QC, plus two
 * columns hidden by default (Showroom Ontario, Mekanism USA). ROC = rest of
 * Canada (Ontario + West). Pure and Firebase-free.
 */

export interface AgencyGroup {
  id: string;
  label: string;
  /** Hidden unless "Show all agencies" is on. */
  hidden: boolean;
}

export const AGENCY_GROUPS: AgencyGroup[] = [
  { id: "cm-roc", label: "CM ROC", hidden: false },
  { id: "mek-roc", label: "MEK ROC", hidden: false },
  { id: "cm-qc", label: "CM MTL/QC", hidden: false },
  { id: "jungle-qc", label: "Jungle QC", hidden: false },
  { id: "showroom-on", label: "Showroom ON", hidden: true },
  { id: "mek-usa", label: "MEK USA", hidden: true },
  { id: "other", label: "Other", hidden: true },
];

const key = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

/** Column a client belongs to, from its agency + BU region (Clients page). */
export function agencyGroupOf(agency: string | null | undefined, region: string | null | undefined): string {
  const a = key(agency);
  const r = key(region);
  const qc = r.includes("qc") || r.includes("quebec") || r.includes("east");
  const roc = r.includes("ontario") || r.includes("west") || r.includes("roc");
  if (a.startsWith("cossette")) return qc ? "cm-qc" : roc ? "cm-roc" : "other";
  if (a.startsWith("mekanism")) return r.includes("usa") || r === "us" ? "mek-usa" : roc ? "mek-roc" : "other";
  if (a.startsWith("jungle")) return qc ? "jungle-qc" : "other";
  if (a.startsWith("showroom")) return "showroom-on";
  return "other";
}
