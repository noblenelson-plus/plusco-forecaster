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
| Inner joins to `master_estimate` / `master_product` / `master_calendar` | Estimates new in MediaOcean (~$0.3M) and months past Dec 2027 dropped | LEFT JOINs; dollars kept, names `no match` |

## Objects

| Object | What |
|---|---|
| `MIR_Live.MIR_staging` | Each run builds here first; copied to `MIR` only if the checks pass |
| `MIR_Live.MIR` | The MIR: MCPE × month × vendor × buy type, sheet column names (+ `MCPE_MIR`, the key as the manual MIR writes it — Network as `T-…`) |
| `MIR_Live.MIR_NATIVE` | **The real-time MIR report**: `MIR` in `PCC_Dashboard_NATIVE`'s exact layout (same 72 columns, order, types) with the manual MIR's lookups and rules — see below |
| `MIR_Live.exceptions` / `exceptions_history` | Clients and vendors `MIR_NATIVE` couldn't tag (not in the MO Client Key / Vendor Database 2.0, no partner…), with $ and a suggestion; history keeps first seen / resolved. Feeds the morning e-mail `apps_script/mir_exceptions_email.gs` (Noble + Adriana: new items daily, full list Mondays) |
| `MIR_Live.spot_history` | Spot per MCPE × station × spot date. Seeded from the 2026-10-01 raw snapshot; never truncated |
| `MIR_Live_snapshots.MIR_YYYYMMDD` | Daily snapshot of `MIR`, 90-day expiry — QA a manual MIR against the same day |
| `MIR_Live.run_log` | One row per step per run (raw window, spot count, rows, total CAD) |
| `MIR_Live.qa_summary` / `qa_monthly` / `qa_lines` / `qa_dimensions` / `qa_coverage` | Output of the last `qa_compare` call |
| Procedures `run_daily`, `run_build`, `refresh_spot_history`, `build_mir_table`, `qa_compare`, `build_native`, `refresh_exceptions`, `learn_order_networks` | Files `02`–`08` |

Scheduled query **MIR_Live daily build** (owner Noble, failure e-mails on) runs
`CALL MIR_Live.run_daily()` every day at 22:00 UTC (18:00 Montreal). Raw Prisma usually lands
~10:45 UTC and raw Spot ~14:35 UTC, but on full-refresh days they have finished as late as ~19:20
UTC; the `mediaocean-data` master tables are rebuilt ~17:20 UTC. A run fails (failure e-mail) and
leaves `MIR` and `spot_history` unchanged when:

- the raw Spot load looks partial (< 80 % of the spots history has for the same dates), or
- the new build has no Spot or no Prisma dollars, has < 95 % of the previous rows, or moves the
  closed 2025 total by more than 1 %.

After a deliberate logic change that moves closed months, run `CALL MIR_Live.run_build(TRUE)` once
(checks reported in `run_log` but not enforced).

## Deploying changes

Files are the source of truth. `01_setup.sql` runs **once** (re-running reseeds `spot_history`
from the 2026-10-01 snapshot). After editing `02`–`05`, re-run that file (it only replaces the
procedure), then `CALL MIR_Live.run_daily()` (or `run_build(TRUE)`, see above) if the change should
apply today.

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

**Baseline (2026-10-21 build vs the 2026-09-28 manual MIR, three weeks apart):** 2025 within 0.09 %
overall and ~1 % for every media; 2026 +7.7 % from buys placed after Sept 28 (844 lines, +$51.5M
only in the automated MIR). Every raw Spot and Prisma dollar from 2025 on is in `MIR`. Where both
MIRs have a vendor, tags agree on 98 % of dollars (agency, client, GM pod), 91–95 % (business lead),
100 % (partner, deal type); channel 81 % on Prisma (SEM and Programmatic are one channel). Check
`qa_coverage` too: `qa_dimensions` only sees lines whose vendor matched on both sides.

**Known difference — Dec 29–31, 2025 Spot (~$1.5M, mostly TV Network).** The manual MIR has no
spots dated Dec 29–31, 2025: its yearly Spot pulls follow MediaOcean's broadcast years (2025 ends
Sun Dec 28, 2026 starts Mon Dec 29) and each keeps only its own calendar months, so those three
days fall between the two. The automated MIR keeps them in 2025-12. Expect Dec 2025 Spot to be
higher than the manual MIR by that amount.

## `MIR_NATIVE` — the MIR report in NATIVE's layout

`run_daily` rebuilds it after `MIR` (`06_build_native.sql`). Each column comes from the same place
as in the manual sheet:

| Columns | Source |
|---|---|
| Client (`CLIENT_INTERCO` … `CLIENT_CURRENCY_MO`) | `Finance_mediabox.MO_Client_Key` by client code; intercompany clients by client + product code |
| Client attributes (status, agency, BL, region, GM pod, FO currency) | Forecaster clients (`pluscoops.forecaster_1.clients`, 2026 status from `clients_status`) |
| Vendor (`PLUSCO_*`, deals, spot market, `present_in_Database_2_0`) | `Finance_mediabox.MIR_VENDOR_DATABASE` (Vendor Database 2.0) by `VENDOR_CODE_MIR` |
| `PLUSCO_MEDIA_CHANNEL` / `PROGRAMMATIC` / `LOCAL_MEDIA`, `Prog_and_SEM` | Vendor DB, then the sheet's rules: Programmatic & SEM split (search buy type, or SEM / MOTS / SEARCH / SM-not-ISM/ASM/OSM in product or estimate → SEM, Foreign; else Programmatic, Hybrid); MIQ + Social buy type → Social, Foreign |
| `Labs_Partners`, `PBB`, `NET_ORDERED_CAD` | Sheet rules (MIQ-SOCIAL/PROG, BILLUPS-PRINT/OOH, …; PBB when SREP; USD × 1.3978) |
| `PO`, `SREP` | Estimate user field 1 (`print_estimate` / `spot_estimate`); Spot buyline special rep + `spot_rep` |
| `BILLED_NET`, `PAID_NET` (billable / payable = ordered − billed / paid) | `print_buy_summary` (Prisma); spot billed / paid summaries (radio by station, spot TV by call letters, network TV per MCPE × month) — spread pro rata where several lines share them |
| `Mediabox_2_0_*` | `Finance_mediabox.finance_Mediabox_combined` by `tac_billing_id` = MCPE |
| `media_spend_target_distributed`, `IS_LABS_PARTNER`, `mb_2_0_*` | `PCC_Dashboard_NATIVE`'s own query (v3), unchanged |

It reads two Google Sheets, so the scheduled query's owner needs Drive access (a failure is logged
in `run_log` as `build_native` and e-mailed; `MIR` is already rebuilt by then).

**Checked against the Oct 27 manual MIR** (same lines, $-weighted): client, BL, GM pod, agency,
currency, channel, partner, deals, Labs, local and every vendor attribute agree on 99–100 %;
billed / paid within ~1–3 % (network TV in total). Known differences: client status follows the
Forecaster's per-year status (the sheet's export showed `ACTIVE` for some 2026 `NEW_CLIENT`s);
MediaBox matches more MCPEs (live finance data); estimate / client text uses MediaOcean's names
(the export sometimes appends the product); `PCT_*` are written `100.00`.

## Not yet in `MIR`

**Network split of conventional TV (~$133M of Spot with no channel/partner).** Conventional network
TV is booked in MediaOcean against group "stations" per language (`FRACN` French, `ENGCN`
English, plus `TORHN`, `MTLFN`). The manual MIR splits them by network (TVA, SRC, Noovo,
Télé-Québec, CTV, Global…) from MediaOcean's orders; each order is one network (`spot_buyline.order_id`,
e.g. the TVA and SRC lines of `N-4CP-TL-004`). `mo_raw_spot.spot_order` (order → `station_code`) is
in the extract definition but arrives empty (staging and raw both 0 rows).
**Solved in `MIR_NATIVE` without it** (`08_network_split.sql`): order → network is learned from the manual MIR
(exact amount matches, then program names, then the one network left in a campaign month) and kept in
`order_network` / `program_network`; `manual_network_share` keeps the manual split per campaign month for months
whose orders have left MediaOcean's extract (Jan–Mar 2025). Oct 27: ~$117M unsplit → $5.7M. Once the manual pull
stops, new campaigns are covered only through known program names, so the order file is still worth enabling.

**Horizon** clients (codes a digit then H: `1HA`, `1HM`, `2HF`…) are excluded everywhere. The earlier rule (second
letter H) also dropped OLG Horse Racing (`OHR`, $255k of radio); fixed 2026-10-28.

**Intercompany clients (~$32M with no PlusCo client id).** Agency interco client codes (`1IB`
Cossette Toronto interco, `1ID`, `1SA`, `1IA`, …) are mapped to the end client in the manual MIR
with the MO Client Key (`Finance_mediabox.MO_Client_Key`); `master_client` maps them at client
level only. **Solved in `MIR_NATIVE`**, which uses the MO Client Key.


Columns the manual MIR adds from its own tabs: `PO`, `SREP`, `PBB`, billed/paid
(`BILLED_NET`, `PAID_NET`, `PCT_*`), `present_in_Database_2_0`, `Prog_and_SEM` (the
SEM/Programmatic split), MediaBox 2.0 MCPE / campaign / match, `LABS_PARTNERS`, commission.
`SPOT_MARKET_CODE` is `no match` on every Spot row (the vendor master has no market for Spot).
