# Partner Data (demo) — partner spend reports vs Mediaocean (MIR)

Feeds **Exec KPI → Partner Data** (Firestore `partner_data/demo`) and the review Google Sheet.
Demo snapshot (2026-11-26): Quantcast, Amazon, Billups. Not automated yet.

Run from an empty work folder (files are read/written relative to the current directory):

```bash
(cd <repo> && npm i --no-save exceljs)   # once, in the repo: scripts resolve packages from their own folder
node <repo>/scripts/partner-data/download.cjs   # latest reports from Drive → in/*.xlsx (ADC with drive.readonly, quota project pluscoops)
node <repo>/scripts/partner-data/mir.cjs        # MIR booked for the partners → in/mir.json
# also: in/mir_clients.json = distinct PLUSCO_CLIENT_NAME 2025–2026 (see compare.cjs)
node <repo>/scripts/partner-data/compare.cjs    # client mapping + month / year-to-date comparison → out_detail.json
node <repo>/scripts/partner-data/sheet.cjs      # review workbook → Google Sheet (sheet_id.txt keeps the same file)
node <repo>/scripts/partner-data/publish.cjs    # → Firestore partner_data/demo (Firebase CLI login token)
```

Decisions (from the data): Quantcast = "Billing Amount" (ties MIR to the cent); USD at 1.3978 (MIR's own rate);
Amazon = delivered months; Billups = Revenue by insertion month, compared year-to-date; flag when > $1,000 and > 1%.
Client-name matches decided by hand live in `MANUAL` in compare.cjs (each with its reason).
