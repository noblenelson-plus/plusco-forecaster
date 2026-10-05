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
