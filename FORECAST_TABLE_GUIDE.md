# Media Spend Forecast Table — Implementation Guide

## Overview

The Media Spend Forecast Table has been successfully built and integrated into the PlusCo Forecaster dashboard. This feature displays forecast data from Firestore in a responsive table matching the MediaBox 1.0 layout.

## Feature Summary

✅ **Complete Implementation**

- Forecast table with 12-month columns (January–December)
- Editable cells (when RFQ is unlocked)
- Read-only cells (when RFQ is locked)
- Actuals section with green header bar
- Total rows and columns with auto-calculated sums
- Canadian currency formatting ($X,XXX,XXX)
- Bilingual support (EN/FR) with translated month names
- Sticky header and first column for easy scrolling
- Responsive design with Tailwind CSS

## Component Architecture

```
components/forecast/
├── types.ts                 ← Type definitions & constants
├── utils.ts                 ← Helper functions (formatting, calculations)
├── EditableCell.tsx         ← Individual cell with edit mode toggle
├── ForecastHeader.tsx       ← Table header with month names
├── ForecastRow.tsx          ← Single data row (channel + 12 months + total)
├── ForecastSummary.tsx      ← Total row with sums
├── ActualsSection.tsx       ← Actuals rows with green header
├── ForecastTable.tsx        ← Main container (data fetching, state management)
└── index.ts                 ← Public exports
```

## How It Works

### Data Flow

1. User selects **Client** and **RFQ** from the sidebar dropdowns
2. User clicks **"Media Spend"** in the navigation
3. `ForecastTable.tsx` queries Firestore:
   ```
   WHERE FO_Client == selectedClient.name
   AND FO_Submission == selectedRFQ.label
   ```
4. Results are separated into two groups:
   - **Forecast rows**: `FO_Type == 'Media spend'`
   - **Actuals rows**: `FO_Type == 'GAIA Actuals'` or `'00_Actuals'`
5. Table renders with:
   - Forecast rows grouped by channel
   - Total row with sums
   - Actuals section below (green header)

### Editable Cells

- **If RFQ is LOCKED**: cells are read-only, display currency values
- **If RFQ is UNLOCKED**: cells are clickable, enter edit mode on click
  - Type a number and press **Enter** or **Tab** to save
  - Press **Escape** to cancel
  - Value updates in Firestore immediately
  - Local state updates to reflect the change

### Currency Formatting

All values use Canadian locale formatting:

- `1100000` → `$1,100,000`
- `325000` → `$325,000`
- `0` → `$0`

## Testing Checklist

### Setup

- [ ] Build succeeded: `npm run build` ✅
- [ ] Firestore is connected and `/forecasts` collection exists
- [ ] Sample forecast data with `FO_Type: 'Media spend'` is in Firestore
- [ ] Sample actuals data with `FO_Type: 'GAIA Actuals'` or `'00_Actuals'` exists (optional)

### Navigation & Display

- [ ] Select a **Client** from the sidebar dropdown
- [ ] Select an **RFQ Period** from the sidebar dropdown
- [ ] Click **"Media Spend"** in the navigation
- [ ] Table loads and displays forecast data
- [ ] Table has 14 columns: Label + 12 months + Total
- [ ] Row headers show channel names (TV, OOH, Print, etc.)
- [ ] Values are formatted as currency (`$X,XXX,XXX`)

### Header Row

- [ ] Yellow background on header
- [ ] "Label" column is sticky (stays visible when scrolling right)
- [ ] Month names are **translated** when FR language is selected
  - EN: January, February, March...
  - FR: Janvier, Février, Mars...
- [ ] "Total" column on the right

### Data Display

- [ ] Forecast rows show correct values from Firestore
- [ ] Each row's Total = sum of Jan–Dec values
- [ ] Total row (bold, gray background) shows correct sums:
  - Each month column shows sum of all channels
  - Final Total cell shows grand total
- [ ] Alternate row colors (white/gray) for readability

### Actuals Section

- [ ] Green header bar appears below forecast total row
- [ ] Header shows: `00_Actuals $TOTAL_AMOUNT`
- [ ] Actuals rows display below the header
- [ ] Actuals values are read-only (no edit mode)
- [ ] Total for actuals is calculated correctly

### Editing (Editable RFQ)

- [ ] RFQ status shows "Editable" (green badge) in header info
- [ ] Cells have blue hover effect indicating they're clickable
- [ ] Click a cell → input field appears
- [ ] Type a number → press Enter → saves to Firestore
- [ ] Local state updates immediately
- [ ] Row Total recalculates
- [ ] Monthly Total recalculates
- [ ] Grand Total recalculates

### Editing (Locked RFQ)

- [ ] RFQ status shows "Read-only" (amber badge) in header info
- [ ] Cells do NOT respond to clicks (no edit mode)
- [ ] All values display as currency text

### Client/RFQ Switching

- [ ] Change **Client** → table reloads with new client's data
- [ ] Change **RFQ** → table reloads with new RFQ's data
- [ ] No console errors during reload

### Language Toggle

- [ ] Toggle to **FR** → all month names translate
- [ ] Toggle to **EN** → all month names revert
- [ ] Table data remains the same (only labels change)

### Edge Cases

- [ ] No client selected → shows "Select a client to view forecasts"
- [ ] No RFQ selected → shows "Select an RFQ period"
- [ ] No forecast data → shows "No forecast data found..."
- [ ] Loading → shows spinner while fetching

## Console Debugging

The `ForecastTable.tsx` includes helpful console logs:

```javascript
// When data is fetched:
[ForecastTable] Querying forecasts for: { client: 'RONA Inc.', submission: '2026 - RFQ 2 (BL Version)' }
[ForecastTable] Found 47 forecast rows
[ForecastTable] Sample doc: { FO_ID: "...", FO_Channel: "TV", January: 1100000, ... }
```

**If table shows "No forecast data found":**

1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Check the log messages:
   - What client/RFQ values are being queried?
   - Are they an exact match to Firestore data?
   - Check Firestore database directly to confirm data exists

## Firestore Field Name Detection

The code automatically handles both field name formats:

- **Long format**: `January`, `February`, ..., `December`
- **Short format**: `jan`, `feb`, ..., `dec`

If your Firestore documents use short month names, they'll work automatically. The first sample document is logged to the console to help identify the actual field names.

## Known Limitations

1. **No pagination**: All matching rows load at once (current: 23,608 rows max per client+RFQ)
   - If query returns 0 rows, consider:
     - Exact spelling match on `FO_Client` and `FO_Submission`
     - Verify `FO_Type` values in Firestore
2. **No sorting/filtering**: Rows display in Firestore order
3. **Actuals section**: Read-only (cannot edit actuals directly)

## File Changes Summary

### New Files Created

- `components/forecast/types.ts` — TypeScript interfaces
- `components/forecast/utils.ts` — Helper functions
- `components/forecast/EditableCell.tsx` — Editable cell component
- `components/forecast/ForecastHeader.tsx` — Table header
- `components/forecast/ForecastRow.tsx` — Data row component
- `components/forecast/ForecastSummary.tsx` — Total row component
- `components/forecast/ActualsSection.tsx` — Actuals section
- `components/forecast/ForecastTable.tsx` — Main table container
- `components/forecast/index.ts` — Public exports

### Modified Files

- `app/[locale]/(dashboard)/media-spend/page.tsx` — Replaced placeholder with ForecastTable
- `i18n/messages/en.json` — Added forecast translations & month names
- `i18n/messages/fr.json` — Added forecast translations & month names

## Next Steps (Optional Enhancements)

- [ ] Add column sorting (click header to sort by month)
- [ ] Add row filtering (search by channel)
- [ ] Add pagination for large datasets
- [ ] Add export to Excel/CSV
- [ ] Add undo/redo for edits
- [ ] Add bulk edit mode (edit multiple cells at once)
- [ ] Add comparison view (compare two RFQs side-by-side)

---

**Status**: ✅ Ready for testing and deployment
