# Finance Toolkit — handback

Branch `finance-toolkit`. Not merged and not deployed. Route: `/admin/finance-toolkit` (sidebar → Admin → **Finance Toolkit**).

## What was built

| Piece | Where |
| :- | :- |
| Data prep script (reads the 8 CSVs, reconciles, matches, aggregates) | `data-prep/build-finance-toolkit-data.mjs`, `data-prep/lib/csv.mjs` |
| Generated sample dataset (committed) | `lib/finance-toolkit/finance-toolkit-data.ts` (~690 KB source, ~190 KB gzipped, one lazy chunk) |
| Types | `lib/finance-toolkit/finance-toolkit.types.ts` |
| All formulas (pure, no React) | `lib/finance-toolkit/model.ts` |
| Page + tabs | `app/(protected)/admin/finance-toolkit/page.tsx`, `components/finance-toolkit/*` |
| Match report / reconciliation | `data-prep/output/match-report.csv`, `data-prep/output/reconciliation.json` |
| Existing code touched | `components/_shared/sidebar.tsx` (one nav entry), `.gitignore` (raw CSVs) |

**Tab 1 · Hours Report Portal.** Period (Jan 2025 – Aug 2026), client / role / time-type filters, group by client, role, month, time type or agency. KPIs, a monthly hours chart (client work vs internal vs time off), a sortable table with a totals row (cost per hour = Σ cost ÷ Σ hours), and a CSV download of the current view.

**Tab 2 · Account Profitability.** Period presets inside the revenue window (Jan–Aug 2026, Q1, Q2, Jul–Aug, custom). KPI strip (gross revenue, staffing cost, gross margin %, revenue per client hour, accounts to review), a revenue vs staffing cost chart with break-even and 50%-margin lines, an "accounts to review" list, and a league table with search, CSV and three views (matched / to review / unmatched). Clicking an account opens a drawer with the monthly revenue vs cost trend (margin % line), monthly staffing and the role mix. Unmatched accounts show "No revenue match" / "No hours match", never a zero margin. A "How this is calculated" panel shows every formula with this view's numbers plugged in.

**Tab 3 · New Business Targets Calculator.** Inputs are agency, expected annual gross revenue (field, log slider, presets) and 1–3 comparable accounts. By default the 3 closest by annualized revenue are suggested, and you can edit the list. Outputs: recommended team (run-rate and peak FTE), year-1 staffing cost, year-1 and run-rate margin, a 12-month stacked chart by role (hours or FTE), the plan table by role × month (CSV), the comparables used, and a formula panel with the worked numbers.

**Context bar.** Agency scope: All Canadian agencies (CAD), Cossette, Jungle or MEK US (USD). CAD and USD are never added together. The cost basis (Base1 / Enterprise) applies to all three tabs.

## Data checks (script output)

- Hours reconcile **exactly** to BigQuery `Finance_Toolkit.maconomy_hours_detail`: 382,635 rows. Cossette 2025 has 150,065 rows / 407,433.91 h, Cossette 2026 138,709 / 344,011.44, Jungle 85,717 / 192,954.64 and MEK US 8,144 / 22,942.17. The script stops if this ever fails.
- Gross revenue: each report's job lines add up to its own client totals, within per-line rounding. Totals: Cossette $24,260,640 · Jungle $6,594,401 · MEK US US$1,013,290 · K72 $343,288. The Profitability headline ties to these figures to the dollar.
- Matching: 202 revenue clients. 180 are matched to hours (179 by Maconomy client number, 1 by exact normalized name: I-HEALTH INC in Jungle), which covers **98.8% of revenue**. That leaves 21 revenue clients with no hours match and 141 hours clients with no revenue match (most have only a few hours or none in Jan–Aug 2026). Full list: `data-prep/output/match-report.csv`.

### Unmatched revenue clients (Jan–Aug 2026)

| Agency | Client | Revenue | Note |
| :- | :- | -: | :- |
| K72 | Industrielle Alliance | 164,633 | Hours under Cossette (1,850 h) |
| K72 | easyfinancial Services | 87,404 | Hours under Jungle (498 h) |
| K72 | Bulk Barn Foods | 48,979 | Hours under Jungle (34 h) |
| K72 | VGC Group LP | 38,022 | |
| K72 | Excelsior Works | 4,250 | |
| Jungle | Excelsior Works | 43,790 | |
| Jungle | Groupe Tecnic Canada | 7,500 | |
| Jungle | Les Éditions Protégez-vous | −4,998 | |
| Cossette | 7 small lines (Sofina, BAC, CAA Québec, McDonald's…) | 4,815 total | |
| Jungle | 5 small lines (AbbVie, Tank, Otsuka, AgencyX, VGC) | 1,944 total | |
| K72 | Plus Company Media Inc. | 0 | House account |

The largest accounts with hours but no revenue line are Industrielle Alliance (Cossette, revenue in K72), the two pitch accounts (Cossette Pitch, Plus Company Ignition Pitch), Intact, easyfinancial (Jungle, revenue in K72), Groupe Aldo and Telus (Cossette, revenue in Jungle).

## Decisions and assumptions (all labeled in the UI)

1. **Time classes.** Client work = client work codes on a real client. Overhead = 15xx (time off), 16xx (internal), and everything on the agency house accounts (Cossette Media Inc., Plus Company Ignition Inc., Inter-Business Units, Cossette Communication Inc.). Overhead is never charged to an account.
2. **Cost and billed amounts are extended amounts, not rates.** For example, 3 h → 108 cost. The script sums them as dollars.
3. **Cost basis.** Base1 and Enterprise are identical for Cossette and Jungle; they differ only for MEK US. Base1 is the default.
4. **Cost coverage.** Some employees have no cost on file in Maconomy: **MEK US 59% of client hours**, Cossette 7%, Jungle 1%. The UI warns wherever coverage is below 98%. The calculator prices roles from costed hours only, and roles with no cost at all use the agency average (for MEK: Media Planner, Media Supervisor, VP).
5. **FTE = 140 client hours/month.** The data agrees: the median full employee-month logs 138.5 client hours (173.5 h including time off and internal work).
6. **Flags.** "Cost > revenue" means staffing cost exceeds revenue. "Over-serviced" means revenue per hour is below 50% of the scope's average. Both need ≥ 40 client hours in the period. Accounts whose revenue nets to ≤ 0 in the period (credit notes or reversals, e.g. Conseil québécois sur le tabac et la santé at −$134,495 for Jan–Aug) are labeled **Net credit**: no margin %, and they are kept out of "Accounts to review". Their revenue still counts in the totals, so the totals tie to the reports. Jan–Aug 2026, all Canadian agencies: 17 cost > revenue, 2 over-serviced, 5 net credit.
7. **Calculator.**
   - Hours per revenue $ = Σ comparables' hours ÷ Σ their revenue (Jan–Aug 2026).
   - Role mix comes from the comparables. Roles under 2% are grouped as "Other roles".
   - Role cost per hour is the agency average over the trailing 12 months.
   - The ramp is the median, across new clients, of month-m hours ÷ the average of months 7–12, smoothed with a monotone (isotonic) fit so the plan never steps back. A new client is one whose first client hour comes at least one month after its agency's export really starts (Feb 2025 for Cossette/Jungle, Apr 2025 for MEK US), with 9+ months observed and ≥ 40 h/month at steady state. The agency's own clients are used when there are at least 5; otherwise all agencies are pooled (13 clients today). Plan ramp: M1 11% · M2 55% · M3 55% · M4 77% · M5 91% · M6 109% (observed medians 11 · 59 · 52 · 77 · 91 · 109).
   - Revenue is assumed to arrive evenly across the year.
8. **Cross-agency work is not merged.** Clients are kept as booked, one row per agency. Where the same client number has revenue in one agency and hours in another, the match report says so.
9. **K72** shows as revenue-only ("No hours match") inside "All Canadian agencies", since there is no K72 hours export.
10. **Employee filter dropped.** No employee names, numbers or emails ship to the browser. Headcounts use anonymous ids.
11. **No client type input.** Maconomy has no client-type field. Comparables are picked by revenue size; client attributes could later come from the Forecaster `clients` collection.

## Found during the visual review

- **The Jan 2025 export is nearly empty**: about 2,100 hours, against roughly 43,000 in a normal month. MEK US only starts in Apr 2025. The Hours chart labels this, and the ramp ignores each agency's first populated month.
- **Cost coverage on the biggest account.** 18% of BRP's client hours (Jan–Aug 2026) carry no cost on file, so its 54% margin is overstated. Cost coverage is low enough to matter on large accounts, not just at MEK US. Notices are a quiet note below 98% coverage and a yellow warning below 90%.
- **Verified in the browser** (dev server, admin account): all three tabs, the account drawer, the scope switch (USD labels for MEK US), the Base1 / Enterprise toggle (MEK US staffing cost $155K → $215K) and the MEK warnings. No console errors from the toolkit; the only one is the app-wide zoom hydration warning that predates this branch.

## Known gaps / open questions for Adriana

- **Security.** The page is admin-gated in the UI and the dataset loads only after the admin check, but the data chunk is a static file on Hosting that anyone holding its URL could fetch. That is fine for a preview demo; it is **not fine for production**. Before deploying, move the data behind Firestore/Storage rules (admin-only), as was done for Reports.
- Cost basis: which one is the true loaded cost (Base1 vs Enterprise)? Also, MEK US cost rates are missing for several people.
- Should cross-agency work be merged per client (e.g. Industrielle Alliance: K72 revenue, Cossette hours)?
- Is K72 in scope? What about GAIA-type clients?
- Revenue is only available for Jan–Aug 2026. Should the Forecaster's monthly GRR import take over later?
- Data refresh cadence: should this be automated from BigQuery?
- Should the calculator stay at role level or propose named people (a capacity view)?
- A few hours rows carry company currency USD inside Cossette and Jungle (242 + 39 rows). They are treated as part of each agency's CAD totals.

## How to rerun the data

```powershell
# 1. Put the 8 CSVs in data-prep/input/ (gitignored)
# 2. From the repo root:
node data-prep/build-finance-toolkit-data.mjs
```

It prints the reconciliation and matching summary, rewrites `lib/finance-toolkit/finance-toolkit-data.ts` and `data-prep/output/*`, and exits with an error (writing nothing) if the hours don't reconcile. When new files arrive, update `EXPECTED` at the top of the script with the new BigQuery totals.
