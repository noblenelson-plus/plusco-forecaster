# bq/mir_live — automated MIR

Daily MIR built in BigQuery from MediaOcean raw data (`mediaocean-data`), replacing the manual
monthly MIR (Prisma + Spot exports combined and cleaned in Google Sheets). Everything lives in
`plusco-media-invest-solutions.MIR_Live`; `mediaocean-data` is only read.

It reuses the logic and dimension tables of `mediaocean-data.L2_Media.MIR_automated_PROC`
(which builds `L2_Media.MIR_ALLMEDIA`) and fixes its Spot issues:

| Issue in `MIR_ALLMEDIA` | Effect | Fix here |
|---|---|---|
| Spot cost spread over rotation days into **broadcast** months | Months off by up to ±20 % vs MediaOcean's report | Whole spot in the calendar month of `spot_date` |
| Billable/payable not prorated | Counted once per month a spot touches | Spots are no longer split across months |
| Stale `spot_vendor_buy_xref` (last built Jan 2026) + untrimmed station codes, then `WHERE vendor_code IS NOT NULL` | ~$4M of 2026 Spot silently dropped | Live station lookup on TRIMmed codes; unmatched stations kept as `no match` |
| Weekly full refresh truncates raw Spot; MediaOcean's extract window moves forward a quarter at a time | Jan–Mar 2025 Spot (~$45M) gone, more each quarter | `spot_history` keeps dates the extract no longer covers |

## Objects

| Object | What |
|---|---|
| `MIR_Live.MIR` | The MIR: MCPE × month × vendor × buy type, sheet column names (+ `MCPE_MIR`, the key as the manual MIR writes it — Network as `T-…`) |
| `MIR_Live.spot_history` | Spot per MCPE × station × spot date. Seeded from the 2026-10-01 raw snapshot; never truncated |
| `MIR_Live_snapshots.MIR_YYYYMMDD` | Daily snapshot of `MIR`, 90-day expiry — QA a manual MIR against the same day |
| `MIR_Live.run_log` | One row per step per run (raw window, spot count, rows, total CAD) |
| `MIR_Live.qa_summary` / `qa_monthly` / `qa_lines` / `qa_dimensions` | Output of the last `qa_compare` call |
| Procedures `run_daily`, `refresh_spot_history`, `build_mir_table`, `qa_compare` | Files `02`–`05` |

Scheduled query **MIR_Live daily build** (owner Noble, failure e-mails on) runs
`CALL MIR_Live.run_daily()` every day at 18:00 UTC — after raw Prisma (~10:45 UTC), raw Spot
(~14:35 UTC) and the `mediaocean-data` master tables (~17:20 UTC). `refresh_spot_history` aborts
without changing anything if the raw Spot load looks partial (< 80 % of the spots history has for
the same dates); the failure e-mail is the signal.

## Deploying changes

Files are the source of truth. `01_setup.sql` runs **once** (re-running reseeds `spot_history`
from the 2026-10-01 snapshot). After editing `02`–`05`, re-run that file (it only replaces the
procedure), then `CALL MIR_Live.run_daily()` if the change should apply today.

## QA against a manual MIR

1. Pull the manual MIR first thing in the morning (BigQuery holds MediaOcean as of the previous
   night — `MO_Date_edt`; edits made during the day show up as differences).
2. After loading it (`PCC_Dashboard_RAW_<yr>_<MON>` / `PCC_Dashboard_NATIVE`), compare it with
   the snapshot of the same day:

   ```sql
   CALL `plusco-media-invest-solutions.MIR_Live.qa_compare`(
     'plusco-media-invest-solutions.PCC_Media_Investment.PCC_Dashboard_NATIVE',
     'plusco-media-invest-solutions.MIR_Live_snapshots.MIR_20261103');
   SELECT * FROM `plusco-media-invest-solutions.MIR_Live.qa_summary` ORDER BY year, media;
   ```

3. Pass criteria: each year × media within 0.5 % and ≥ 98 % of dollars on lines within 1 %
   (`qa_summary.status`), months within 0.5 % (`qa_monthly`), and every line in `qa_lines`
   explained (pre-bill reversed, buy edited after the pull, …). Two passing months → switch.

**Baseline (2026-10-20 build vs the 2026-09-28 manual MIR, three weeks apart):** 2025 within
~1.2 % for every media; 2026 +7 % to +17 % from buys placed after Sept 28 (750 lines, +$45.9M
only in the automated MIR). Dimensions agree on 98 % of dollars (agency, client, GM pod), 91–95 %
(business lead), 100 % (partner, deal type); channel 81 % on Prisma because the automated MIR
reports SEM and Programmatic as one channel.

**Known difference — Dec 29–31, 2025 Spot (~$1.5M, mostly TV Network).** The manual MIR has no
spots dated Dec 29–31, 2025: its yearly Spot pulls follow MediaOcean's broadcast years (2025 ends
Sun Dec 28, 2026 starts Mon Dec 29) and each keeps only its own calendar months, so those three
days fall between the two. The automated MIR keeps them in 2025-12. Expect Dec 2025 Spot to be
higher than the manual MIR by that amount.

## Not yet in `MIR`

Columns the manual MIR adds from its own tabs: `PO`, `SREP`, `PBB`, billed/paid
(`BILLED_NET`, `PAID_NET`, `PCT_*`), `present_in_Database_2_0`, `Prog_and_SEM` (the
SEM/Programmatic split), MediaBox 2.0 MCPE / campaign / match, `LABS_PARTNERS`, commission.
`SPOT_MARKET_CODE` is `no match` on every Spot row (the vendor master has no market for Spot).
