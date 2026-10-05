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

**Rebuild order after a MIR change** (each reads `PCC_Dashboard_NATIVE`, so
rebuild NATIVE first, then *all* of these, then `node scripts/sync-all.mjs`):
`KPI_BY_CLIENT` · `MEDIAOCEAN_INVESTMENT_MIX` · `SOCIAL_PARTNER_MIX` ·
`CHANNEL_MIX` (plus `META_SOCIAL_OUTPUT`, not yet versioned here). Skipping
one leaves that page on the old MIR — e.g. on 2026-10-02 NATIVE was rebuilt but
the three mix tables weren't, so Media Investments kept the old deal tags.

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

1. Load the sheets, rebuild `PCC_Dashboard_NATIVE`, then rebuild every table
   above (see *Rebuild order*).
2. `node scripts/sync-all.mjs` — copies BigQuery into the app and takes the
   QA snapshot automatically at the end.
3. In the app: QA → Data Health → **Run all checks**. All green means the app
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
