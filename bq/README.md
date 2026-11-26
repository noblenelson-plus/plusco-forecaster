# bq/

Hand-built BigQuery SQL for `plusco-media-invest-solutions.PCC_Media_Investment`
(see `docs/bigquery.md`). These tables are rebuilt by hand with
`CREATE OR REPLACE` after each monthly MIR load, then synced to Firestore with
`node scripts/sync-all.mjs`.

**This folder is the source of truth.** Run the files from here, not from a
local copy, so a monthly rebuild never undoes a fix.

| File | Builds | Synced to (Firestore) |
|---|---|---|
| `KPI_BY_CLIENT_2025_vs_2026.sql` | `KPI_BY_CLIENT_2025_vs_2026` | `mo_kpi_by_client` (`scripts/sync-kpi-by-client.mjs`) |
| `MEDIAOCEAN_INVESTMENT_MIX.sql` | `MEDIAOCEAN_INVESTMENT_MIX` | `mediaocean_investment_mix` (`scripts/sync-mediaocean-investment-mix.mjs`) |
| `SOCIAL_PARTNER_MIX_2025_vs_2026.sql` | `SOCIAL_PARTNER_MIX_2025_vs_2026` | `social_partner_mix` (`scripts/sync-social-partner-mix.mjs`) |
| `CHANNEL_MIX_2025_vs_2026.sql` | `CHANNEL_MIX_2025_vs_2026` | — (Looker only) |
| `Concatenated_finance_table.sql` | `Finance_mediabox.finance_combined` → `finance_Mediabox_combined` → `PCC_Media_Investment.finance_master_mapping` → `finance_mapped_client_segmentation` (scheduled query, daily 13:00 UTC; copy — the schedule is the source of truth) | `mediabox_planner_mix` + `reports/mediabox_planner/*` (`scripts/sync-mediabox-planner.mjs`) |
| `fee_label_mapping.sql` | `Finance_mediabox.fee_label_mapping` (MediaBox fee label → Commission / Taxes / Other fees) | — (read by the finance pipeline) |
| `PCC_Dashboard_RAW_COMBINED.sql` | view over the current `PCC_Dashboard_RAW_2025_<MON>` + `_2026_<MON>` sheets (repoint both `FROM` lines each month) | — |
| `PCC_Dashboard_NATIVE.sql` | `PCC_Dashboard_NATIVE` (main MIR fact table) | `mir_raw` (`scripts/sync-mir-raw.mjs`) |
| `PCC_Dashboard_NATIVE_LOCAL.sql` | `PCC_Dashboard_NATIVE_LOCAL` (hybrid local / foreign split) | — (Looker only) |
| `Native_Forecast_Clients.sql` | `Native_Forecast_Clients` (NATIVE + client attributes; read by KPI_BY_CLIENT) | — |
| `PCC_Dashboard_UNIFIED.sql` | `PCC_Dashboard_UNIFIED` | — (Looker only) |
| `META_SOCIAL_OUTPUT_2025_vs_2026.sql` | `META_SOCIAL_OUTPUT_2025_vs_2026` | `meta_social_output` (`scripts/sync-meta-social-output.mjs`) |
| `BCR_2026.sql` | `BCR_2026` (NATIVE × MediaBox finance) | — |
| `Billing_summary_master.sql` | `Billing_summary_master` from the monthly `Billing_Summary_2026_<MON>` sheet (repoint the `FROM` line) | `reports/billing/*` (`scripts/sync-billing-summary-raw.mjs`) |

`mir_live/` builds the automated MIR (`MIR_Live.MIR`) daily from MediaOcean raw on a
scheduled query, plus the QA against a manual MIR. In QA — not yet feeding
`PCC_Dashboard_NATIVE`. See `mir_live/README.md`.

**Rebuild order after a MIR change.** Every table below reads `PCC_Dashboard_NATIVE`
(directly or through `labs_pacing_wide`), so rebuild them *all*, in this order, then
run `node scripts/sync-all.mjs`:

1. `PCC_Dashboard_RAW_COMBINED` (view: repoint to the new month's tables)
2. `PCC_Dashboard_NATIVE`
3. `PCC_Dashboard_NATIVE_LOCAL` · `Native_Forecast_Clients`
4. `PCC_Dashboard_UNIFIED` · `META_SOCIAL_OUTPUT_2025_vs_2026`
5. `MEDIAOCEAN_INVESTMENT_MIX` · `KPI_BY_CLIENT_2025_vs_2026` · `CHANNEL_MIX_2025_vs_2026`
6. `SOCIAL_PARTNER_MIX_2025_vs_2026` (reads META_SOCIAL_OUTPUT) · `BCR_2026`
7. `Billing_summary_master` (independent: repoint to the new billing sheet)

The labs views (`labs_pacing_unified`, `labs_pacing_wide`) are views and need no rebuild,
but when you change one, rebuild everything that reads `labs_pacing_wide`:
`PCC_Dashboard_UNIFIED`, `META_SOCIAL_OUTPUT` (then `SOCIAL_PARTNER_MIX`) and `KPI_BY_CLIENT`.
Skipping one leaves that page on the old MIR — e.g. on 2026-10-02 NATIVE was rebuilt but
the three mix tables weren't, so Media Investments kept the old deal tags.

The monthly RAW and billing tables are Google-Sheets-backed: the `bq` CLI and the
BigQuery MCP connector can't read them without a Drive scope. Use an ADC login
(`gcloud auth application-default login`) with the BigQuery REST API, or the console.

Run (read the file, validate, then build):

```bash
bq query --location=northamerica-northeast1 --use_legacy_sql=false --dry_run < bq/KPI_BY_CLIENT_2025_vs_2026.sql
bq query --location=northamerica-northeast1 --use_legacy_sql=false < bq/KPI_BY_CLIENT_2025_vs_2026.sql
```

**Labs Share of Total Media** counts only the partners configured in the
Forecaster (Admin → LABS, read from `pluscoops.forecaster_1.labs_partners`), so
adding a Labs partner there flows in at the next rebuild — no SQL edit needed.

## Monthly process and QA check

The QA page (QA → **Data Health**) shows whether the app matches BigQuery. The
app can't query BigQuery, so `sync-all` also saves a snapshot of the tables
(rebuild times, row counts, $ totals) to `dashboard_meta/qa_fingerprint`
(`scripts/qa-fingerprint.mjs`). The **Run all checks** button re-reads the
app's data and compares it with that snapshot — it never touches BigQuery.

**Before running any script:** you need BigQuery Data Viewer + Job User on
`plusco-media-invest-solutions`, Firestore write on `pluscoops`, and a current
login (`gcloud auth application-default login` if it has expired). Run the
scripts from the `plusco-forecaster` folder.

**Every month, after the new MIR lands:**

1. Before loading, check the sheets: no blank channel or 2026 Deals tag (a new
   Vendor DB 2.0 row needs its K–N deal formulas; Nov 2026: one row without them
   left 2 lines with a blank tag), and the billing sheet's 'Client Database' tab is
   the full client list (Nov 2026: a partial paste left 17,644 billing rows,
   $160M, with agency #N/A, so agencies couldn't see them in Reports).
2. Load the sheets, repoint `PCC_Dashboard_RAW_COMBINED` and
   `Billing_summary_master`, then rebuild every table above (see *Rebuild order*).
3. `node scripts/sync-all.mjs` — copies BigQuery into the app and takes the
   QA snapshot automatically at the end.
4. In the app: QA → Data Health → **Run all checks**. All green means the app
   matches BigQuery.

**Run the snapshot on its own** (`node scripts/qa-fingerprint.mjs`, then
**Run all checks**) when:

- a BigQuery table was rebuilt or changed after the last sync and you want to
  know whether the app is behind — anything not synced yet shows as **Fail**;
- `sync-all` ended with "⚠ QA fingerprint failed" (the data is synced, only
  the snapshot wasn't refreshed).

**Reading the results:**

- **Fail — Freshness:** a table wasn't rebuilt after the latest MIR load.
  Rebuild it, then run `sync-all`.
- **Fail — BigQuery parity:** BigQuery has data the app doesn't. The check
  names the sync script to run (e.g. `node scripts/sync-kpi-by-client.mjs`).
- **Check (yellow):** a known, explained difference — e.g. Total LABS Spend vs
  Labs booked (MIQ Audio/Search excluded from the pacing views).
- **Info:** context only (latest MIR load, last full sync, MIR clients not in
  the Forecaster).

How each dashboard number is calculated is on QA → **Metric Formulas**
(`lib/qa/metric-definitions.ts` — update it whenever a formula changes).
