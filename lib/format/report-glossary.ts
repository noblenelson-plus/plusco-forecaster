// filepath: lib/format/report-glossary.ts

/**
 * Glossary tab added to a Reports raw-data Google Sheets export: one row per
 * exported column (same order as the data tab), with its plain-language
 * definition. Pure — no Firebase, no Google APIs.
 *
 * MIR wording comes from Adriana's "Forecaster_MIR Glossary" sheet
 * (2026-11-27); PRODUCT and PAYREP_CODE were blank there and filled here.
 */

import type { SheetLayout } from "./forecast-sheets";

export interface ReportGlossary {
  /** Line shown above the table (optional). */
  intro?: string;
  /** Column name (snapshot field) → definition. */
  definitions: Record<string, string>;
}

export const MIR_GLOSSARY: ReportGlossary = {
  intro:
    "PLUSCO columns do not exist in Mediaocean. They have been added to streamline client and vendor nomenclature and tracking information.",
  definitions: {
    SOURCE: "The date the MIR report was pulled from Mediaocean",
    AGENCY: "Media Agency tied to the client",
    BU_REGION: "Business Unit Region tied to the Agency",
    GM_POD: "General Manager tied to the Agency & Region",
    OFFICE:
      "CC = COSSETTE MEDIA\nJC = JUNGLE\nMU = MEKANISM\nPK = K72\nPT = SHOWROOM",
    BUSINESS_LEAD: "Business Lead tied to the client",
    PLUSCO_CLIENT_NAME:
      "Standardized and deduplicated Client Name to match Mediabox Forecaster",
    CLIENT: "Name of client as it appears in Mediaocean",
    ESTIMATE: "Campaign Name / identifier",
    PLUSCO_MEDIA_CHANNEL:
      "Media Name standardized into 8 PlusCo Channels (TV, Radio, Print, OOH, Digital Direct, Programmatic, Social, SEM)",
    MEDIA: "Media type aligned with Mediaocean (TV, Radio, OOH, Print, Digital)",
    PRODUCT: "Product (brand / line of business) under the client, as set up in Mediaocean",
    BUYTYPE:
      "Display (Used for Digital Direct/Prog), Social, SEM (Used for Search & ChatGPT), and other formats such as Video and Audio",
    PAYREP_CODE: "Mediaocean code of the pay rep (the entity that receives the invoice)",
    PAYREP: "PAY REP field refers to the entity/partner that receives the invoice.",
    VENDOR_CODE: "This is the vendor code",
    VENDOR: "The media partner/publisher/station purchased",
    PLUSCO_MEDIA_PARTNER:
      "This is a mix of rep house and owners - use this field for the names of Partners for deal tracking. Any partners tagged as Rep House can then be further broken down by Owner",
    PLUSCO_2026_DEALS:
      "Identifies which PLUSCO_MEDIA_PARTNER have deals (labs, volume) that year",
    PLUSCO_DEALS_Type:
      "Identifies which PLUSCO_MEDIA_PARTNER is part of a PlusCo Deal. Type = Volume Deals, Labs",
    PLUSCO_LOCAL_MEDIA:
      "Identifies which vendor are considered LOCAL VS FOREIGN media. Based on the HQ of the master owner, as per SMI/CMDC methodology. HYBRID media are programmatic media like DV360 (ie: local vs foreign split requires more granular analysis)",
    Labs_Partners:
      "Name of Partner-Media Type as it appears in Forecaster (ex: Billups-OOH, Billups-PRINT, MIQ-Prog, MIQ-Social, etc)",
    PO: "Client Billing Number",
    MCPE: "Billing ID - concatenate of MEDIA CODE-CLIENT CODE-PRODUCT CODE-ESTIMATE CODE",
    MONTH: "Month In-Market",
    PLUSCO_QUARTER:
      "Formula to tag months as Q1 (Jan-March), Q2 (April-June), Q3 (July-Sept), Q4 (Oct-Dec)",
    PLUSCO_YEAR: "Year tied to the MONTH field",
    CLIENT_CURRENCY_MO:
      "Identifies the currency of Mediaocean input (NET ORDERED). Currency is programmed at the Client level.",
    NET_ORDERED:
      "The net $ input into Mediaocean (note: $ can be input in CAD or USD depending on the client)",
    NET_ORDERED_CAD:
      "NET_ORDERED column converted to CAD. Calculated using a fixed currency exchange rate of 1.3978 (source: Bank of Canada, Annual Average 2025)",
  },
};

/** Rows taken by the glossary tab for `fieldCount` exported columns. */
export function glossaryRowCount(glossary: ReportGlossary, fieldCount: number): number {
  return (glossary.intro ? 2 : 0) + 1 + fieldCount;
}

/**
 * The glossary tab: optional intro line, a blank row, then a
 * "Column Name | Description" table listing the exported columns in export
 * order. `headers[i]` is the label written in the data tab for `fields[i]`;
 * a column without a definition gets an empty description.
 */
export function buildGlossaryTab(
  glossary: ReportGlossary,
  fields: string[],
  headers: string[]
): { matrix: string[][]; layout: SheetLayout } {
  const matrix: string[][] = [];
  if (glossary.intro) matrix.push([glossary.intro, ""], ["", ""]);
  const headerRow = matrix.length;
  matrix.push(["Column Name", "Description"]);
  fields.forEach((f, i) => {
    matrix.push([headers[i] ?? f, glossary.definitions[f] ?? ""]);
  });
  return {
    matrix,
    layout: {
      styles: [
        ...(glossary.intro ? [{ row: 0, col: 0, style: { italic: true } }] : []),
        {
          row: headerRow,
          col: 0,
          cols: 2,
          style: { bold: true, color: "#ffffff", background: "#000000" },
        },
        { row: headerRow + 1, col: 0, rows: fields.length, style: { bold: true } },
      ],
      frozenRows: headerRow + 1,
      columnWidths: { 0: 220, 1: 640 },
    },
  };
}
