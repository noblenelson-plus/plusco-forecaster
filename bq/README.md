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

Run (read the file, validate, then build):

```bash
bq query --location=northamerica-northeast1 --use_legacy_sql=false --dry_run < bq/KPI_BY_CLIENT_2025_vs_2026.sql
bq query --location=northamerica-northeast1 --use_legacy_sql=false < bq/KPI_BY_CLIENT_2025_vs_2026.sql
```

**Labs Share of Total Media** counts only the partners configured in the
Forecaster (Admin → LABS, read from `pluscoops.forecaster_1.labs_partners`), so
adding a Labs partner there flows in at the next rebuild — no SQL edit needed.
