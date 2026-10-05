// lib/qa/metric-definitions.ts
/**
 * Metric definitions catalog for the QA page: how every dashboard metric is
 * calculated today, written for a non-engineer reviewer (the media-team lead).
 *
 * It mirrors the BigQuery build SQL in bq/*.sql (plus the labs_pacing_unified /
 * labs_pacing_wide views, which live only in BigQuery) and the app code under
 * lib/dashboard/data/* and components/forecaster/*. It is documentation only:
 * nothing here is computed. When a formula, filter, hardcoded value or UI label
 * changes in the SQL or the code, update the matching entry in the same change.
 *
 * General rules (apply to every group unless an entry says otherwise):
 *  - Amounts are CAD. MIR uses NET_ORDERED_CAD. Forecaster amounts of USD clients
 *    are multiplied by the year's USD→CAD rate (Admin → Currency); the BigQuery
 *    KPI SQL hardcodes 1.3978 instead.
 *  - Test clients (a standalone "test" in the client name) and hidden clients are
 *    excluded from every dashboard tab; the scope is the dashboard client filters.
 *  - Shares are always sum(numerator) ÷ sum(denominator) over the clients in
 *    scope, never an average of per-client percentages.
 */

export interface MetricDefinition {
  /** Metric name exactly as shown in the UI. */
  name: string;
  /** Where it appears (tab → sub-tab / section), e.g. "Exec KPI → Media & Labs KPIs; Media Investments → Investment KPIs". */
  where: string;
  /** Plain-English formula, e.g. "Labs spend ÷ Total media spend". */
  formula: string;
  /** What each term means / which rows are included and excluded. */
  details: string;
  /** Source: BigQuery table + columns and/or Firestore collection + app file. */
  source: string;
  /** Data basis: "MIR (booked)" | "Forecaster (forecast)" | "Targets" | "Mixed". */
  basis: string;
  /** Optional caveats, known differences vs other metrics, hardcoded values. */
  notes?: string;
}

export interface MetricGroup {
  id: string;
  title: string;
  description: string;
  metrics: MetricDefinition[];
}

// Shared "where" strings, so the same placement reads identically everywhere.
const FC_SUMMARY = "Forecaster → Forecast Summary → Key metrics";
const FC_STRATEGY = "Forecaster → Forecast Summary → Investment Strategy KPIs strip";
const BOOKED_BAND =
  "Exec KPI Dashboard → Media & Labs KPIs (Booked to date (MIR) view); Media Investments Report → Media Investments → Investment KPIs (bottom)";
const STRATEGY_PAGE =
  "Exec KPI Dashboard → Investment Strategy KPIs; Media Investments Report → KPIs Media and Labs";
const MIR_INVEST = "Media Investments Report → Media Investments";
const LABS_PACING = "Labs Pacing tab; Exec KPI Dashboard → Deal Pacing";
/** GM-level Labs sections — removed from the all-roles Labs Pacing tab. */
const DEAL_PACING = "Exec KPI Dashboard → Deal Pacing";
const BY_GM = "Exec KPI Dashboard → Media & Labs KPIs → Exec KPIs by GM";
const BY_CLIENT =
  "Exec KPI Dashboard → Media & Labs KPIs → KPIs by Client; Media Investments Report → Media Investments → Investment KPIs → KPIs by Client";

// Shared source strings.
const KPI_SRC =
  "BigQuery PCC_Media_Investment.KPI_BY_CLIENT_2025_vs_2026 (bq/KPI_BY_CLIENT_2025_vs_2026.sql) → Firestore mo_kpi_by_client";
const FC_SRC =
  "Firestore data_entries (selected Year + RFQ) → lib/dashboard/data/use-scope-forecast-data.ts + aggregate.ts";

export const METRIC_GROUPS: MetricGroup[] = [
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "forecaster-summary",
    title: "Forecaster — Forecast Summary",
    description:
      "Live forecast figures entered by Business Leads for the Year + RFQ picked in Time & Context, over the Forecaster tab's client scope (clients assigned to you; Admin: all). The Months filter narrows every figure. USD clients are converted with the year's USD→CAD rate (CAD view); the USD view shows USD clients only, unconverted. Variance pills compare against the comparison (VS) Year + RFQ. Clicking a client focuses the cards on that client.",
    metrics: [
      {
        name: "Total media spend",
        where: FC_SUMMARY,
        formula: "Sum of every BL media forecast row (all 8 media types) for the selected months",
        details:
          "Media types: Social, Programmatic, OOH, Print, TV, Radio, SEM, Digital Direct. Only Business Lead input counts; MediaOcean actuals on the Media grid are ignored.",
        source: `${FC_SRC} (computeMediaBreakdown → totalAnnual); components/forecaster/tabs/exec-summary-tab.tsx`,
        basis: "Forecaster (forecast)",
        notes: "Variance pill = this total vs the comparison submission's total (% change, plus $ change).",
      },
      {
        name: "Total revenue",
        where: FC_SUMMARY,
        formula: "Sum over clients and months of the BL Submission revenue",
        details:
          "BL Submission is decided per client and per month: if any GAIA detail line has a value that month (an entered 0 counts), the GAIA detail lines are used; otherwise the BL revenue input rows (all streams, Commission as stored) are used. The 'Official Revenue' line is never part of it.",
        source: `${FC_SRC} (revenueByMode.blSubmission); lib/format/revenue-commission.ts (blSubmissionByStream)`,
        basis: "Forecaster (forecast)",
        notes: "Shown with the sub-label 'BL submission'. Hidden from Viewers (revenue page).",
      },
      {
        name: "Revenue / Media",
        where: FC_SUMMARY,
        formula: "Total revenue ÷ Total media spend",
        details: "Both terms exactly as the two cards above; shown as a % ('revenue per $ of media'). Blank when media is 0.",
        source: "components/forecaster/tabs/exec-summary-tab.tsx",
        basis: "Forecaster (forecast)",
      },
      {
        name: "Total Labs spend",
        where: FC_SUMMARY,
        formula: "Sum of every BL Labs forecast row (all partners) for the selected months",
        details:
          "Every row of the Labs grid's BL input, including partners no longer configured for the year. Labs MediaOcean actuals are ignored.",
        source: `${FC_SRC}; lib/format/labs-penetration.ts (computeLabsPenetration → totalLabs)`,
        basis: "Forecaster (forecast)",
      },
      {
        name: "Labs share",
        where: FC_SUMMARY,
        formula: "Total Labs spend ÷ Total BL media forecast",
        details:
          "Same numerator as Total Labs spend; the denominator is all BL media forecast rows. The card turns green at or above the target, yellow below it.",
        source: "lib/format/labs-penetration.ts (ratio, targetRatio)",
        basis: "Forecaster (forecast)",
        notes: "Target is hardcoded at 25% (LABS_RATIO_TARGET), not read from Admin → Labs Targets.",
      },
      {
        name: "MediaBox adoption",
        where: FC_SUMMARY,
        formula: "MediaBox media spend ÷ BL media forecast, both for MediaBox-mapped clients only",
        details:
          "Only clients with at least one MediaBox id mapped count on both sides. MediaBox spend comes from the nightly MediaBox totals (converted to CAD, same months); the forecast side is that client's BL media forecast.",
        source: "Firestore mediabox_totals → lib/dashboard/data/use-scope-mediabox-totals.ts; exec-summary-tab.tsx",
        basis: "Mixed",
        notes: "Always scope-wide: it does not follow the focused client. No comparison pill.",
      },
      {
        name: "Digital Direct share of Digital",
        where: FC_STRATEGY,
        formula: "Digital Direct media forecast ÷ Digital media forecast",
        details: "Digital = BL media forecast for SEM + Social + Programmatic + Digital Direct.",
        source: "components/forecaster/sections/strategy-kpis.ts",
        basis: "Forecaster (forecast)",
        notes: "Delta = (this share − comparison share) in points, 2 decimals. The strip is hidden when total media is 0.",
      },
      {
        name: "Prog share of Digital",
        where: FC_STRATEGY,
        formula: "Programmatic media forecast ÷ Digital media forecast",
        details: "Digital = SEM + Social + Programmatic + Digital Direct (BL media forecast).",
        source: "components/forecaster/sections/strategy-kpis.ts",
        basis: "Forecaster (forecast)",
      },
      {
        name: "MIQ-Social",
        where: FC_STRATEGY + " (Meta Derisking)",
        formula: "Sum of the Labs forecast for the partner named 'MIQ-Social'",
        details: "Partner name matched case-insensitively among the year's configured Labs partners.",
        source: "components/forecaster/sections/strategy-kpis.ts",
        basis: "Forecaster (forecast)",
        notes: "Delta is in dollars (this − comparison).",
      },
      {
        name: "LABS share of Total Media",
        where: FC_STRATEGY + " (Labs Growth)",
        formula: "Total Labs forecast ÷ Total media forecast",
        details: "Same as the 'Labs share' card (all Labs rows ÷ BL media of the 8 media types).",
        source: "components/forecaster/sections/strategy-kpis.ts",
        basis: "Forecaster (forecast)",
      },
      {
        name: "Prog Labs share of Prog",
        where: FC_STRATEGY + " (Labs Growth)",
        formula: "(MIQ-Prog + Quantcast + Yahoo + Amazon + AIM-Prog + StackAdapt Labs forecast) ÷ Programmatic media forecast",
        details: "Partner names matched case-insensitively against the configured Labs partners of the year.",
        source: "components/forecaster/sections/strategy-kpis.ts (PROG_LABS list)",
        basis: "Forecaster (forecast)",
        notes: "Partner list is hardcoded in the code. MIR version (Labs group) uses a different partner rule.",
      },
      {
        name: "Billups-OOH share of OOH",
        where: FC_STRATEGY + " (Labs Growth)",
        formula: "Billups-OOH Labs forecast ÷ OOH media forecast",
        details: "All clients in scope; no Billups eligibility filter here.",
        source: "components/forecaster/sections/strategy-kpis.ts",
        basis: "Forecaster (forecast)",
        notes: "Differs from the Exec KPI 'Billups Share of OOH', which counts eligible clients only.",
      },
      {
        name: "Billups-Print share of Print",
        where: FC_STRATEGY + " (Labs Growth)",
        formula: "Billups-Print Labs forecast ÷ Print media forecast",
        details: "All clients in scope; no Billups eligibility filter here.",
        source: "components/forecaster/sections/strategy-kpis.ts",
        basis: "Forecaster (forecast)",
        notes: "Differs from the Exec KPI 'Billups Share of PRINT' (eligible clients only).",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "mir-investments",
    title: "Media Investments (MIR)",
    description:
      "Booked MediaOcean (MIR) spend. Total Media Investment and Top Partners follow the MIR From → To month period at the top of the page; Social always compares 2025 vs 2026. MIR rows are matched to the client filter by client NAME (case-insensitive), so MIR clients whose name does not match a Forecaster client are left out.",
    metrics: [
      {
        name: "Total Media Spend",
        where: MIR_INVEST + " → Total Media Investment",
        formula: "Sum of NET_ORDERED_CAD of every MIR row in scope",
        details:
          "Rows whose year-month is inside the From → To period, for clients in the filter. Rows with a blank, '#N/A' or 'N/A' media channel are excluded in SQL.",
        source:
          "BigQuery MEDIAOCEAN_INVESTMENT_MIX (bq/MEDIAOCEAN_INVESTMENT_MIX.sql) → Firestore mediaocean_investment_mix → lib/dashboard/data/use-mediaocean-investment-mix.ts (computeTotalMediaInvestment)",
        basis: "MIR (booked)",
      },
      {
        name: "Digital Share of Total Media",
        where: MIR_INVEST + " → Total Media Investment",
        formula: "(Programmatic + SEM + Digital Direct + Social channel spend) ÷ Total Media Spend",
        details: "Channels matched case-insensitively. The sub-line shows the digital $ and the total $.",
        source: "use-mediaocean-investment-mix.ts (DIGITAL_CHANNELS)",
        basis: "MIR (booked)",
        notes:
          "Uses the MIR channel only. The Exec KPI 'Digital' definition also adds MIQ rows bought as Social (BUYTYPE = SOCIAL) whatever their channel.",
      },
      {
        name: "Investment by Channel",
        where: MIR_INVEST + " → Total Media Investment",
        formula: "Sum of NET_ORDERED_CAD per media channel; Grand total = Total Media Spend",
        details: "Channel spellings are merged case-insensitively (e.g. 'Print' and 'PRINT'). Sorted by spend.",
        source: "use-mediaocean-investment-mix.ts (computeTotalMediaInvestment → mediaMix)",
        basis: "MIR (booked)",
      },
      {
        name: "Media Mix",
        where: MIR_INVEST + " → Total Media Investment",
        formula: "Channel spend ÷ Total Media Spend, per channel",
        details: "Pie of every channel in the table.",
        source: "use-mediaocean-investment-mix.ts (mediaMix)",
        basis: "MIR (booked)",
      },
      {
        name: "Digital Media Mix",
        where: MIR_INVEST + " → Total Media Investment",
        formula: "Digital channel spend ÷ total digital spend, per digital channel",
        details: "Only Programmatic, SEM, Digital Direct and Social.",
        source: "use-mediaocean-investment-mix.ts (digitalMix)",
        basis: "MIR (booked)",
      },
      {
        name: "Top 20 Partners (table) / Spend by Partner (chart)",
        where: MIR_INVEST + " → Top Partners",
        formula: "Sum of NET_ORDERED_CAD per media partner, ranked; top 20 shown",
        details:
          "Same rows as Total Media Investment, further narrowed by the section's Media Channel / 2026 Deals / Media Partner filters. Blank partners are grouped as 'Other / Direct' (SQL). The '2026 Deals' column shows the deal value carrying the most spend for that partner.",
        source: "use-mediaocean-investment-mix.ts (computeTopPartners); components/forecaster/sections/mediaocean-top-partners-section.tsx",
        basis: "MIR (booked)",
        notes: "Top 20 is hardcoded (TOP_N).",
      },
      {
        name: "Deal Partners $",
        where: MIR_INVEST + " → Top Partners",
        formula: "Sum of spend on rows whose PLUSCO_2026_DEALS is exactly 'Partner Deal'; % = ÷ all partner spend in view",
        details: "Decided row by row (not per partner). Case-insensitive, trimmed.",
        source: "use-mediaocean-investment-mix.ts (isDealValue)",
        basis: "MIR (booked)",
        notes:
          "Inconsistency: here 'Partner Deal - OLG' and '#N/A' are Non-Deal, but the Exec KPI DD/Prog deal split treats ANY value other than '#N/A'/blank as a deal.",
      },
      {
        name: "Non-Deal Partners $",
        where: MIR_INVEST + " → Top Partners",
        formula: "Sum of spend on every other row; % = ÷ all partner spend in view",
        details: "Includes '#N/A', blanks and 'Partner Deal - OLG'. Deal $ + Non-Deal $ = total partner spend in view.",
        source: "use-mediaocean-investment-mix.ts (computeTopPartners)",
        basis: "MIR (booked)",
      },
      {
        name: "Social Partners — Spend 2025 / Spend 2026",
        where: MIR_INVEST + " → Social Media",
        formula: "Sum of NET_ORDERED_CAD per social partner for 2025 and for 2026",
        details:
          "Social = rows with channel SOCIAL, plus MIQ rows with BUYTYPE SOCIAL (renamed 'MIQ-SOCIAL'). Partner names are upper-cased. The header caption '$X social spend (2026)' is the 2026 grand total.",
        source:
          "BigQuery SOCIAL_PARTNER_MIX_2025_vs_2026 (bq/SOCIAL_PARTNER_MIX_2025_vs_2026.sql) → Firestore social_partner_mix → lib/dashboard/data/use-social-partner-mix.ts",
        basis: "MIR (booked)",
        notes:
          "Fixed 2025 vs 2026. If the From → To period sits inside one calendar year (and is not all 12 months), only those month numbers are kept, for both years; otherwise full years. Possible gap: the SQL joins on Agency / BU Region / Business Lead / GM Pod, so a row with any of these blank may be dropped.",
      },
      {
        name: "Variance $",
        where: MIR_INVEST + " → Social Media → Social Partners",
        formula: "Spend 2025 − Spend 2026",
        details: "Positive = the partner's social spend went down vs 2025.",
        source: "use-social-partner-mix.ts (computeSocialSummary)",
        basis: "MIR (booked)",
        notes: "Opposite sign to the SQL column variance_cad (2026 − 2025), on purpose (matches the Looker report). The app ignores the SQL annual columns and recomputes from monthly spend.",
      },
      {
        name: "Share ppt",
        where: MIR_INVEST + " → Social Media → Social Partners",
        formula: "(Partner 2026 spend ÷ total 2026 social) − (Partner 2025 spend ÷ total 2025 social), in points",
        details: "Totals are the social totals of the rows in view (same clients and months).",
        source: "use-social-partner-mix.ts (sharePpt)",
        basis: "MIR (booked)",
      },
      {
        name: "Social Share: 2025 vs 2026",
        where: MIR_INVEST + " → Social Media",
        formula: "Per partner: 2025 spend ÷ total 2025 social, next to 2026 spend ÷ total 2026 social",
        details: "Paired bars; same figures as the Share ppt column.",
        source: "components/forecaster/sections/mediaocean-social-section.tsx",
        basis: "MIR (booked)",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "labs-mir",
    title: "Labs (MIR booked)",
    description:
      "Booked 2026 Labs spend from the KPI_BY_CLIENT table (full year, not period-filtered), summed over the clients in the dashboard filter. Goals come from Admin → Labs Targets for the selected year.",
    metrics: [
      {
        name: "Labs Share of Total Media",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE} (Achieve Labs Targets)`,
        formula: "Total LABS Spend ÷ Total 2026 media spend",
        details:
          "Numerator = labs_spend_2026 (rule below). Denominator = total_spend_2026: all 2026 MIR rows whose channel is not 'N/A' (blank channels also drop out).",
        source: `${KPI_SRC} (labs_spend_2026, total_spend_2026); lib/dashboard/data/use-mo-kpi-by-client.ts (computeInvestmentKpis)`,
        basis: "MIR (booked)",
        notes:
          "Goal = 'Total Labs share of media target' (Admin → Labs Targets). The Investment Strategy page instead shows a hardcoded sub-line 'Plusco Target: 20–25%'. Sep 28 MIR reference: $98,457,925 / 21%.",
      },
      {
        name: "Total LABS Spend",
        where: BOOKED_BAND,
        formula: "Sum of 2026 NET_ORDERED_CAD on Labs rows",
        details:
          "Labs row = deal type LABS or 'LABS - BRP', channel ≠ N/A, partner ≠ MAGNITE, and partner is a configured Labs partner family for 2026 (Admin → LABS list, name before '-', e.g. Billups-OOH → BILLUPS). Excludes LABS-tagged partners outside the list (Trader Interactive, iHeart Media, Sirius XM, Media Pulse).",
        source: `${KPI_SRC} (labs_2026 / labs_spend_2026, labs_families CTE)`,
        basis: "MIR (booked)",
        notes:
          "Goal = Exec goal 'Labs spend' (Admin → Labs Targets); hidden on the Media Investments page because it is portfolio-wide. Includes ALL MIQ LABS-tagged buy types (incl. Audio/Search, Sep 28 MIR: $672,156), unlike 'Labs Booked to Date (MIR)' in the Pacing/GM views. MIR has no AIM rows today; if MIR ever tags 'AIM-PROG', it would not match the 'AIM' family and drop out.",
      },
      {
        name: "Total LABS Spend — per-partner breakdown",
        where: BOOKED_BAND,
        formula: "Per partner family: sum of the same Labs rows as Total LABS Spend",
        details:
          "Every configured 2026 partner family is listed (a family with no booked spend shows $0). Billups = OOH + Print; MIQ = all MIQ Labs rows. The parts add up to Total LABS Spend.",
        source: `${KPI_SRC} (labs_by_partner_2026 JSON); components/forecaster/sections/use-booked-exec-kpis.ts (labsByPartner)`,
        basis: "MIR (booked)",
      },
      {
        name: "Prog Labs Share of Prog",
        where: `${STRATEGY_PAGE} (Achieve Labs Targets); ${BY_CLIENT}`,
        formula: "Programmatic Labs spend ÷ Programmatic spend (2026)",
        details:
          "Programmatic = channel PROGRAMMATIC. Prog Labs = programmatic rows with partner Yahoo, Amazon, Quantcast, AIM, AIM-PROG or StackAdapt, or MIQ with buy type Display / Video / Display&Video. No deal-type filter.",
        source: `${KPI_SRC} (prog_labs_spend_2026, prog_spend_2026)`,
        basis: "MIR (booked)",
        notes: "Partner list is hardcoded in the SQL. AIM-Social / AIM-SEM are intentionally not counted.",
      },
      {
        name: "Labs Share of Total Media / Total Labs Forecast (Forecaster view)",
        where: "Exec KPI Dashboard → Media & Labs KPIs (Forecaster toggle)",
        formula: "Total Labs forecast ÷ Total BL media forecast; Total Labs Forecast = sum of all BL Labs rows",
        details:
          "Live Forecaster data for the selected Year + RFQ, all 12 months, for the clients in the filter. The sub-line shows the $ change vs the comparison submission.",
        source: `${FC_SRC} (labs.ratio, labs.totalLabs); components/forecaster/sections/executive-summary-section.tsx`,
        basis: "Forecaster (forecast)",
        notes: "Same goals as the booked tiles (Labs share target, Exec 'Labs spend' goal).",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "meta",
    title: "Meta",
    description:
      "Meta divestment KPIs: 2026 booked MIR (orders to date in the latest MIR) vs 2025 full-year MIR, and a 2026 Meta target built from the RFQ3 Social forecast. Values come from the KPI_BY_CLIENT table, summed over the clients in the filter.",
    metrics: [
      {
        name: "Meta Spend 2026",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE} ('Meta Spend')`,
        formula: "Sum of 2026 NET_ORDERED_CAD where partner = META and channel = SOCIAL",
        details: "All deal types. Channel 'N/A' rows are excluded.",
        source: `${KPI_SRC} (meta_spend_2026)`,
        basis: "MIR (booked)",
        notes:
          "Its target line and '% of target' use Target Meta Spend (next entry), not the Exec goal 'Meta spend' saved in Admin → Labs Targets (that goal is not used here). Booked is to date (latest MIR) while the target is full-year.",
      },
      {
        name: "Target Meta Spend (−30%)",
        where: `${BOOKED_BAND} (Meta Spend target line); ${STRATEGY_PAGE}; ${BY_GM} ('Meta Target'); ${BY_CLIENT} ('Meta Target')`,
        formula: "Per client: RFQ3 2026 Social forecast × (Meta 2025 ÷ Social 2025) × 0.70, summed",
        details:
          "If the client has no 2025 Social or no 2025 Meta: forecast × 0.67 × 0.70. If its Social forecast is 0: target 0. Social forecast = Forecaster media axis, category Social, 2026, RFQ3, USD × 1.3978, test/hidden clients excluded.",
        source: `${KPI_SRC} (target_meta_spend_2026, target_cte, social_forecast_rfq1)`,
        basis: "Mixed",
        notes:
          "Hardcoded: 0.70 (−30%), default 2025 Meta share 0.67, RFQ3, USD rate 1.3978, test client id. The column is named social_forecast_rfq1 but holds RFQ3.",
      },
      {
        name: "Meta Share of Social 2026",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE} ('Meta Share of Social')`,
        formula: "Meta Spend 2026 ÷ Social spend 2026",
        details:
          "Social = channel SOCIAL, plus MIQ rows with buy type SOCIAL (whatever their channel). YoY = 2026 share − 2025 share in points; a drop is favorable.",
        source: `${KPI_SRC} (meta_spend_2026, social_spend_2026, *_2025)`,
        basis: "MIR (booked)",
        notes: "Target shown under it = Target Meta Share of Social (next entry), not the Exec goal 'Meta share of social'.",
      },
      {
        name: "Target Meta Share of Social",
        where: `${BOOKED_BAND} (sub-line 'Target x%'); ${STRATEGY_PAGE}; ${BY_GM} ('Meta Target Share')`,
        formula: "Sum of Target Meta Spend ÷ sum of RFQ3 2026 Social forecast",
        details: "Both terms over the clients in the filter.",
        source: `${KPI_SRC} (target_meta_spend_2026, social_forecast_rfq1)`,
        basis: "Mixed",
      },
      {
        name: "Other Platforms Share 2026",
        where: STRATEGY_PAGE,
        formula: "(Social 2026 − Meta 2026) ÷ Social 2026",
        details: "YoY pill = 2026 share − 2025 share; a rise is favorable.",
        source: `${KPI_SRC} (other_platforms_spend_2026/2025)`,
        basis: "MIR (booked)",
      },
      {
        name: "% of Target",
        where: STRATEGY_PAGE + " (Meta Divestment)",
        formula: "Meta Spend 2026 ÷ Target Meta Spend",
        details: "Booked to date (latest MIR) vs a full-year target.",
        source: "use-mo-kpi-by-client.ts (meta.pctOfTarget)",
        basis: "Mixed",
      },
      {
        name: "MIQ-Social Spend",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE} ('MIQ-Social Spend Booked'); ${BY_CLIENT}`,
        formula: "Sum of 2026 NET_ORDERED_CAD where partner = MIQ and buy type = SOCIAL",
        details: "All deal types; channel 'N/A' rows excluded.",
        source: `${KPI_SRC} (miq_social_spend_2026)`,
        basis: "MIR (booked)",
        notes:
          "Target = the 'MIQ-Social' row's media spend target on Admin → Labs Targets (Deal Targets); shown on the Exec page only (hidden on Media Investments because it is portfolio-wide).",
      },
      {
        name: "MIQ-Social Forecast",
        where: `${STRATEGY_PAGE}; Exec KPI Dashboard → Media & Labs KPIs (Forecaster toggle)`,
        formula: "Sum of the RFQ3 2026 Labs forecast for category MIQ-Social",
        details:
          "From BigQuery (Forecaster labs axis, RFQ3, USD × 1.3978), not the live RFQ picker. On the Forecaster toggle, '% of target' = MIQ-Social Spend (MIR) ÷ this forecast.",
        source: `${KPI_SRC} (miq_social_forecast_2026)`,
        basis: "Forecaster (forecast)",
        notes: "Pinned to RFQ3 and refreshed only at the monthly sync.",
      },
      {
        name: "Meta Share Trend (Divested / Increasing / Flat)",
        where: `Exec KPI Dashboard → Media & Labs KPIs (trend strip); ${STRATEGY_PAGE}; ${BY_CLIENT}`,
        formula: "Per client label; the strip shows each label's client count ÷ clients with a label",
        details:
          "Divested: no Meta in 2025 and 2026, or Meta dropped to 0, or share fell by ≥ 1pt. Increasing: Meta new in 2026, or share rose by ≥ 1pt. Flat: otherwise.",
        source: `${KPI_SRC} (meta_share_trend); use-mo-kpi-by-client.ts (metaShareTrendBreakdown)`,
        basis: "MIR (booked)",
        notes: "BRP is hardcoded to no label (excluded from the counts). Threshold ±0.01 (1pt) is hardcoded.",
      },
      {
        name: "Meta sub-tab scorecards and tables",
        where: "Exec KPI Dashboard → Meta",
        formula: "Same Meta formulas (Meta ÷ Social, target × 0.70, etc.) on a different table",
        details: "This sub-tab reads meta_social_output, not mo_kpi_by_client.",
        source:
          "BigQuery META_SOCIAL_OUTPUT_2025_vs_2026 → Firestore meta_social_output → lib/dashboard/data/use-meta-social-output.ts",
        basis: "Mixed",
        notes: "Not catalogued column by column here; its numbers can differ slightly from the KPI_BY_CLIENT-based tiles above.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "billups",
    title: "Billups",
    description:
      "Billups' share of OOH and Print spend, for clients eligible for Billups on that channel. Booked figures come from the KPI_BY_CLIENT table (2026, full year); the goal is the Exec goal 'Billups share' (Admin → Labs Targets).",
    metrics: [
      {
        name: "Billups Share of OOH",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE}; Exec KPI Dashboard → Billups; ${BY_GM}; ${BY_CLIENT}`,
        formula: "Billups OOH spend ÷ OOH channel spend, OOH-eligible clients only",
        details:
          "Billups OOH = channel OOH and partner BILLUPS (any deal type). Eligibility = Eligible_Billups_OOH on Native_Forecast_Clients; blank counts as eligible; 'N/A', 'No' or 'Not eligible' excludes the client.",
        source: `${KPI_SRC} (billups_ooh_spend_2026, ooh_spend_2026, eligible_billups_ooh); lib/dashboard/data/use-billups-by-client.ts (computeBillupsKpis)`,
        basis: "MIR (booked)",
        notes:
          "The SQL already zeroes OOH spend of ineligible clients, so the app's 'non-eligible' bucket reads $0 on MIR data. Forecaster toggle: Billups-OOH Labs forecast ÷ OOH media forecast, eligibility from the Forecaster Labs eligibility toggle (Billups-OOH, 2026 partners).",
      },
      {
        name: "Billups Share of PRINT",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE} ('Billups Share of Print'); Exec KPI Dashboard → Billups; ${BY_GM}; ${BY_CLIENT}`,
        formula: "Billups Print spend ÷ Print channel spend, Print-eligible clients only",
        details:
          "Billups Print = channel PRINT and partner BILLUPS. Eligibility = Eligible_Billups_PRINT (blank = eligible), judged separately from OOH: a client can be OOH-eligible but not Print-eligible.",
        source: `${KPI_SRC} (billups_print_spend_2026, print_spend_2026, eligible_billups_print); use-billups-by-client.ts`,
        basis: "MIR (booked)",
        notes: "Forecaster toggle uses the Billups-Print Labs forecast ÷ Print media forecast with the Forecaster eligibility toggle.",
      },
      {
        name: "Missed Opportunity",
        where: `${BOOKED_BAND}; ${BY_GM} ('$ Missed'); ${BY_CLIENT} ('$ Missed (OOH)', '$ Missed (Print)', '$ Missed (Total)')`,
        formula: "(Eligible OOH spend − Billups OOH) + (Eligible Print spend − Billups Print)",
        details: "Only eligible clients. The small caption splits it into OOH and Print; the two parts add to the total.",
        source: "use-billups-by-client.ts (combined.missed, ooh/print.eligibleMissed)",
        basis: "MIR (booked)",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "digital",
    title: "Digital",
    description:
      "Shift to Programmatic / decrease Digital Direct. 2026 booked MIR (to date) vs 2025 full year, from the KPI_BY_CLIENT table, summed over the clients in the filter.",
    metrics: [
      {
        name: "Digital Direct Share of Digital",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE}; ${BY_GM}; ${BY_CLIENT} ('DD Share of Digital')`,
        formula: "Digital Direct spend ÷ Digital spend (2026); YoY = 2026 share − 2025 share (points)",
        details:
          "Digital = channels Digital Direct, Programmatic, SEM and Social, plus MIQ rows with buy type SOCIAL whatever their channel. Digital Direct = channel DIGITAL DIRECT. A YoY drop is favorable.",
        source: `${KPI_SRC} (digital_direct_spend_2026/2025, digital_spend_2026/2025); use-booked-exec-kpis.ts (digital)`,
        basis: "MIR (booked)",
        notes: "The YoY pill is rounded to whole points in the band (2 decimals on the Investment Strategy page).",
      },
      {
        name: "Digital Direct $ Non-Deal",
        where: `${BOOKED_BAND}; ${BY_GM}; ${BY_CLIENT} ('DD Non-Deal $')`,
        formula: "Sum of 2026 Digital Direct spend where PLUSCO_2026_DEALS is blank or '#N/A'",
        details: "Any other deal value counts as Deal.",
        source: `${KPI_SRC} (dd_nondeal_spend_2026)`,
        basis: "MIR (booked)",
        notes: "Deal rule differs from Top Partners (which only counts exactly 'Partner Deal' as Deal).",
      },
      {
        name: "Prog Share of Digital",
        where: `${BOOKED_BAND}; ${STRATEGY_PAGE}; ${BY_GM}; ${BY_CLIENT}`,
        formula: "Programmatic spend ÷ Digital spend (2026); YoY = 2026 share − 2025 share (points)",
        details: "Programmatic = channel PROGRAMMATIC. Digital as above. A YoY rise is favorable.",
        source: `${KPI_SRC} (prog_spend_2026/2025, digital_spend_2026/2025)`,
        basis: "MIR (booked)",
        notes: "An MIQ row bought as Social with channel Programmatic counts in both Programmatic and Social.",
      },
      {
        name: "Prog $ Non-Deal",
        where: `${BOOKED_BAND}; ${BY_GM}; ${BY_CLIENT} ('Prog Non-Deal $')`,
        formula: "Sum of 2026 Programmatic spend where PLUSCO_2026_DEALS is blank or '#N/A'",
        details: "Any other deal value counts as Deal.",
        source: `${KPI_SRC} (prog_nondeal_spend_2026)`,
        basis: "MIR (booked)",
      },
      {
        name: "$ Deal Partners / $ Non-Deal Partners",
        where: STRATEGY_PAGE + " (Grow Programmatic; Decrease Digital Direct)",
        formula: "Deal (or Non-Deal) spend of the channel; % = ÷ that channel's 2026 spend",
        details: "Programmatic and Digital Direct each get a pair. Deal = PLUSCO_2026_DEALS not blank and not '#N/A'.",
        source: `${KPI_SRC} (prog_deal/nondeal_spend_2026, dd_deal/nondeal_spend_2026)`,
        basis: "MIR (booked)",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "labs-pacing",
    title: "Labs Pacing / Deal Pacing",
    description:
      "Labs targets vs booked spend by partner, client and GM pod. 'Target vs Booked by Partner' uses the PLUSCO deal targets (Admin → Labs Targets) and the RFQ selected in Time & Context; the pacing tables compare the Forecaster Labs forecast with MediaOcean Labs actuals.",
    metrics: [
      {
        name: "PLUSCO Deals Target",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner",
        formula: "Sum of the partner's 'media spend target' rows for the selected year",
        details:
          "Only target rows whose deal type is in the Deal Type filter (default Labs + Labs - BRP). Billups-OOH + Billups-Print roll up to Billups, MIQ-Prog + MIQ-Social to MIQ, AIM-* to AIM.",
        source: "Firestore partner_targets/{year} → components/forecaster/sections/labs-target-vs-booked-data.ts",
        basis: "Targets",
      },
      {
        name: "RFQx Labs Forecast",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner",
        formula: "Sum of the Forecaster Labs forecast per partner, full year, selected Year + RFQ",
        details:
          "Clients in the filter, CAD-converted with the Admin rate. Joined to the target rows by normalized partner name (after the roll-up). Blank ('—') for partners with no forecast.",
        source: "Firestore data_entries (labs axis) → lib/dashboard/data/use-scope-labs-pacing.ts → labs-pacing-data.ts (computeLabsPacing)",
        basis: "Forecaster (forecast)",
        notes: "Column label follows the selected RFQ (e.g. 'RFQ3 Labs Forecast'); in code it is still called 'rfq2Target'.",
      },
      {
        name: "Booked to Date",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner",
        formula: "Sum of NET_ORDERED_CAD per partner for the selected year, all months",
        details:
          "MIR rows with deal type LABS or 'LABS - BRP', channel ≠ N/A, partner ≠ MAGNITE; joined to the target rows by normalized partner name. No configured-partner-list filter.",
        source: "Firestore mediaocean_investment_mix → components/forecaster/sections/use-labs-target-vs-booked.ts (bookedByPartner)",
        basis: "MIR (booked)",
        notes:
          "NOT narrowed by the client filter (only by your agency access), unlike the forecast column. If the synced rows lack PLUSCO_DEALS_Type, booked falls back to unfiltered partner spend.",
      },
      {
        name: "% of PLUSCO Target",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner",
        formula: "Booked to Date ÷ PLUSCO Deals Target",
        details: "Grand total = total booked ÷ total target over the rows shown.",
        source: "labs-target-vs-booked-data.ts; labs-target-vs-booked-section.tsx (recomputeTotals)",
        basis: "Mixed",
      },
      {
        name: "% of RFQ Forecast",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner",
        formula: "Booked to Date ÷ RFQx Labs Forecast",
        details: "Grand total uses only the booked $ of rows that have a forecast, ÷ total forecast.",
        source: "labs-target-vs-booked-data.ts; labs-target-vs-booked-section.tsx",
        basis: "Mixed",
      },
      {
        name: "Total Media (MIR)",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner (tile)",
        formula: "Sum of NET_ORDERED_CAD of every MIR row for the selected year",
        details: "All channels except blank / 'N/A' / '#N/A'; all months.",
        source: "use-mediaocean-investment-mix.ts (computeTotalMediaInvestment) via use-labs-target-vs-booked.ts",
        basis: "MIR (booked)",
        notes: "Not narrowed by the client filter (agency access only), so it can differ from the Exec 'Total spend' denominator.",
      },
      {
        name: "All LABS-Tagged Deals ÷ Media",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner (tile)",
        formula: "Booked to Date of every target-roster partner in the selected deal types ÷ Total Media (MIR)",
        details: "Includes partners outside the Forecaster's Labs list (e.g. Sirius XM, iHeart) when they have a Labs Targets row.",
        source: "labs-target-vs-booked-data.ts (tiles.labsShareAll)",
        basis: "Mixed",
        notes:
          "Despite the label, a LABS-tagged MIR partner with no Labs Targets row is not counted. Not the official Labs share; ignores the Partner filter.",
      },
      {
        name: "Labs Share of Media (Forecaster only)",
        where: DEAL_PACING + " → Labs — Target vs Booked by Partner (tile)",
        formula: "Booked to Date of partners flagged 'Included in RFQ' ÷ Total Media (MIR)",
        details: "A rolled-up partner counts only if every one of its target rows is flagged as in the Labs forecaster.",
        source: "labs-target-vs-booked-data.ts (tiles.labsShareForecaster)",
        basis: "Mixed",
        notes: "Close to, but not computed like, the Exec 'Labs Share of Total Media' (different booked rule and client scope).",
      },
      {
        name: "Forecast RFQx (Target) — Labs Pacing By Partner",
        where: LABS_PACING + " → Labs Pacing → By Partner / By Client (By GM Pod: Deal Pacing only)",
        formula: "Sum of the Forecaster Labs forecast per partner for the selected Year + RFQ and the section's months",
        details:
          "Clients in the filter, CAD-converted. The section has its own Months filter (default January → two months before today) and Partner filter. AIM-Prog / AIM-Social / AIM-SEM roll into one 'AIM' line.",
        source: "use-scope-labs-pacing.ts; components/forecaster/sections/labs-pacing-data.ts; labs-pacing-section.tsx",
        basis: "Forecaster (forecast)",
      },
      {
        name: "Booked (MIR) — Labs Pacing",
        where: LABS_PACING + " → Labs Pacing → By Partner / By Client (By GM Pod: Deal Pacing only)",
        formula: "Sum of the Labs MediaOcean actuals per partner for the same months",
        details:
          "Read from the Forecaster's annual Labs actuals (the 'MediaOcean' rows admins load per client and year), not from the synced KPI table.",
        source: "Firestore annual_actuals (labs) → use-scope-labs-pacing.ts",
        basis: "MIR (booked)",
        notes: "Can differ from the KPI_BY_CLIENT booked figures if the loaded actuals are from another MIR vintage.",
      },
      {
        name: "$ Variance to Target / % of Target Booked",
        where: LABS_PACING + " → Labs Pacing → By Partner (+ charts), By Client",
        formula: "$ Variance = Booked − Target; % = Booked ÷ Target × 100",
        details: "Shown as '—' when nothing is booked. Negative variance (behind) reads red.",
        source: "labs-pacing-data.ts (computeLabsPacing, computeClientPacing)",
        basis: "Mixed",
      },
      {
        name: "Flag (By Client)",
        where: LABS_PACING + " → Labs Pacing → By Client",
        formula: "Over-Achieved if % > 100; Achieved if % ≥ 90, or below 90% with a miss ≤ $50K; else Under Target",
        details: "One row per client × partner.",
        source: "labs-pacing-data.ts (flagFor)",
        basis: "Mixed",
        notes: "Hardcoded: 90% and $50,000 materiality.",
      },
      {
        name: "By GM Pod — % of Target Booked / Summary",
        where: DEAL_PACING + " → Labs Pacing → By GM Pod",
        formula: "Per pod (and partner × pod): Booked ÷ Target × 100; toggles show Booked $, Target $, Gap $",
        details: "Pod = the client's GM Pod in the Forecaster ('—' if blank). Heat: ≥ 100% green, ≥ 80% amber, below red.",
        source: "labs-pacing-data.ts (computeGmPodMatrix); labs-pod-matrix.tsx",
        basis: "Mixed",
      },
      {
        name: "Labs Booked to Date (MIR) — KPI table / by GM",
        where: `${BY_GM} ('Labs Booked to Date (MIR)', '% Target (MIR/RFQ)', 'Labs — by partner')`,
        formula: "Sum of labs_booked_mir_2026 = booked spend of the fixed pacing partners in 2026",
        details:
          "From the labs_pacing views: Amazon, Quantcast, Yahoo, AIM (all variants), StackAdapt, Reddit, Billups (OOH and Print channels only), MIQ mapped only for buy types Display/Video/Display&Video (MIQ-Prog) and Social (MIQ-Social). No deal-type filter.",
        source:
          "BigQuery labs_pacing_unified → labs_pacing_wide (views, not in the repo) → KPI_BY_CLIENT labs_booked_mir_2026 / labs_booked_{partner}_2026 → components/forecaster/sections/exec-kpis-by-gm-table.tsx",
        basis: "MIR (booked)",
        notes:
          "Known difference vs Total LABS Spend: MIQ Audio/Search booked spend is excluded here but included there (Sep 28 MIR: $672,156); this view also counts these partners' non-LABS deal types. The views pin year 2026, RFQ3, USD 1.3978 and the test-client id.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "kpi-tables",
    title: "KPIs by Client / by GM tables",
    description:
      "Two booked (MIR) tables over the scoped KPI_BY_CLIENT rows. Every share — per client, per GM column and in the totals — is sum(numerator) ÷ sum(denominator); totals are computed from summed dollars, never averaged. Cell colours: green ≥ 90% of goal, amber ≥ 75%, red below (Meta share is lower-is-better).",
    metrics: [
      {
        name: "PlusCo Total / GM columns",
        where: BY_GM,
        formula: "Each column re-runs every formula on its own clients; PlusCo Total runs it on all clients in scope",
        details: "Clients are grouped by GM_POD ('Unassigned' if blank). Dollar rows of the GM columns add up to the Total.",
        source: `${KPI_SRC}; exec-kpis-by-gm-table.tsx`,
        basis: "MIR (booked)",
      },
      {
        name: "Labs Share of Media",
        where: `${BY_GM}; ${BY_CLIENT}`,
        formula: "Labs Spend ÷ Total 2026 media spend",
        details: "Same as the Labs 'Labs Share of Total Media'. Coloured vs the Labs share target.",
        source: `${KPI_SRC} (labs_spend_2026, total_spend_2026)`,
        basis: "MIR (booked)",
      },
      {
        name: "Labs RFQ Target (RFQ3)",
        where: BY_GM,
        formula: "Sum of labs_target_rfq2_2026 = RFQ3 2026 Labs forecast of the fixed pacing partners",
        details:
          "Forecaster labs axis, 2026, RFQ3, categories Amazon, Billups-OOH/Print, MIQ-Prog/Social, Quantcast, Yahoo, AIM (all variants), StackAdapt, Reddit; USD × 1.3978; test/hidden clients excluded.",
        source: "BigQuery labs_pacing_wide → KPI_BY_CLIENT labs_target_rfq2_2026",
        basis: "Forecaster (forecast)",
        notes: "Column named 'rfq2' but holds RFQ3 (pinned in labs_pacing_unified).",
      },
      {
        name: "% Target (MIR/RFQ)",
        where: BY_GM,
        formula: "Labs Booked to Date (MIR) ÷ Labs RFQ Target (RFQ3)",
        details: "Booked uses the pacing-view rule (see Labs Pacing group). Coloured vs 100%.",
        source: "exec-kpis-by-gm-table.tsx",
        basis: "Mixed",
      },
      {
        name: "Labs — by partner",
        where: BY_GM,
        formula: "Per partner: booked ÷ target, with 'of $target · $gap behind/ahead'",
        details: "Billups = OOH + Print, MIQ = Prog + Social, plus Amazon, Yahoo, Quantcast, Reddit, AIM, StackAdapt.",
        source: "KPI_BY_CLIENT labs_target_{partner}_2026 / labs_booked_{partner}_2026; exec-kpis-by-gm-table.tsx",
        basis: "Mixed",
        notes: "Colour here: ≥ 100% green, ≥ 90% amber, below red (stricter than the rest of the table).",
      },
      {
        name: "Meta Target / Meta Spend / Meta Share",
        where: `${BY_GM}; ${BY_CLIENT}`,
        formula: "Meta Target = Σ Target Meta Spend; Meta Spend = Σ Meta 2026; Meta Share = Meta 2026 ÷ Social 2026",
        details: "See the Meta group. Meta Share is coloured vs that column's/client's target share (lower is better).",
        source: `${KPI_SRC}`,
        basis: "Mixed",
      },
      {
        name: "Meta Target Share",
        where: BY_GM,
        formula: "Σ Target Meta Spend ÷ Σ RFQ3 Social forecast; pill = target share − 2025 actual share",
        details: "A target below last year's share (negative pill) is favorable.",
        source: "exec-kpis-by-gm-table.tsx",
        basis: "Mixed",
      },
      {
        name: "Meta Share Var YOY",
        where: `${BY_CLIENT} (by GM: pill on 'Meta Share')`,
        formula: "Meta share 2026 − Meta share 2025",
        details: "Shares computed as Meta ÷ Social for each year.",
        source: "exec-kpis-by-client-table.tsx (metaShareVar)",
        basis: "MIR (booked)",
        notes: "Shown with a '%' sign but it is a difference in points.",
      },
      {
        name: "% Clients Divested Meta Share",
        where: BY_GM,
        formula: "Clients whose Meta Share Trend contains 'divest' ÷ clients with any trend label",
        details: "BRP has no label, so it is not counted.",
        source: "exec-kpis-by-gm-table.tsx",
        basis: "MIR (booked)",
      },
      {
        name: "MIQ Scenario",
        where: BY_CLIENT,
        formula: "'Not Eligible for MIQ-Social', '… AIM-Social' or both; blank (—) when eligible",
        details:
          "From the client's Labs eligibility toggles in the Forecaster (Edit client → Labs eligibility) for the selected year's MIQ-Social and AIM-Social partners.",
        source: "Firestore clients (Labs_Eligibility) + labs_partners → use-booked-exec-kpis.ts (miqScenarioById)",
        basis: "Targets",
        notes: "No longer read from the MIR 'Scenario' column (scenario_meta_mapping).",
      },
      {
        name: "Labs Spend / MIQ-Social Spend",
        where: BY_CLIENT,
        formula: "Labs Spend = Total LABS Spend rule; MIQ-Social Spend = MIQ rows with buy type Social (2026)",
        details: "See the Labs and Meta groups.",
        source: `${KPI_SRC} (labs_spend_2026, miq_social_spend_2026)`,
        basis: "MIR (booked)",
      },
      {
        name: "DD / Prog columns (Share of Digital, Var vs 2025 (ppt), Non-Deal $)",
        where: `${BY_CLIENT}; ${BY_GM} (Digital rows)`,
        formula: "Share = channel ÷ Digital; Var = 2026 share − 2025 share (points); Non-Deal $ = blank/'#N/A' deal spend",
        details: "Same definitions as the Digital group.",
        source: `${KPI_SRC}`,
        basis: "MIR (booked)",
      },
      {
        name: "Billups OOH Share / Billups Print Share / $ Missed",
        where: `${BY_CLIENT}; ${BY_GM}`,
        formula: "Billups ÷ channel for eligible clients; $ Missed = eligible channel − Billups",
        details: "An ineligible client shows '—' for the share and $0 missed. Coloured vs the Billups share goal.",
        source: `${KPI_SRC}; exec-kpis-by-client-table.tsx`,
        basis: "MIR (booked)",
      },
      {
        name: "Grand total (KPIs by Client footer)",
        where: BY_CLIENT,
        formula: "Dollar columns: sum over the rows; share columns: summed numerator ÷ summed denominator",
        details: "So the footer ties to the PlusCo Total column of the by-GM table and to the scorecards.",
        source: "exec-kpis-by-client-table.tsx (aggregate)",
        basis: "MIR (booked)",
        notes:
          "The KPI data is always 2026 (columns are pinned *_2026 in SQL) even if another year is picked; the goals follow the picked year. 'As of' falls back to a hardcoded 'Jul 27, 2026' when the last-sync date is unavailable.",
      },
    ],
  },
];
