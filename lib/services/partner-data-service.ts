// lib/services/partner-data-service.ts

/**
 * Exec KPI → Partner Data: the partner-spend-report vs MIR comparison published
 * by scripts/partner-data/publish.cjs to `partner_data/demo` (one document;
 * readable by admins and Exec KPI grantees).
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export interface PartnerDataPartner {
  partner: string;
  period: string;
  reportUsed: string;
  report: number;
  mir: number;
  lines: number;
  flagged: number;
}

export interface PartnerDataLine {
  partner: string;
  channel: string;
  client: string;
  partnerAmt: number;
  mirAmt: number;
  status: string;
}

export interface PartnerDataYtd extends PartnerDataLine {
  partnerRaw: string;
  monthsOff: number;
  months: number;
}

export interface PartnerDataMonth extends PartnerDataLine {
  month: string;
  usd: number | null;
}

export interface PartnerDataMapping {
  partner: string;
  raw: string;
  mir: string | null;
  method: string;
  reason: string;
  total: number;
}

export interface PartnerDataDoc {
  generatedAt: string;
  mirSource: string;
  sheetUrl: string;
  fx: number;
  partners: PartnerDataPartner[];
  findings: string[];
  method: string[];
  notDone: string[];
  ytd: PartnerDataYtd[];
  detail: PartnerDataMonth[];
  mapping: PartnerDataMapping[];
}

export async function fetchPartnerData(): Promise<PartnerDataDoc | null> {
  const snap = await getDoc(doc(db, "partner_data", "demo"));
  return snap.exists() ? (snap.data() as PartnerDataDoc) : null;
}
