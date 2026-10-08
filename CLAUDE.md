# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The git repository and Next.js app live in `plusco-forecaster/` (a subdirectory of the workspace root). Run all commands from there. The workspace-root `package.json` is unrelated to the app.

## Commands

```bash
npm run dev      # Next.js dev server (Turbopack)
npm run build    # Production build
npm run start    # Serve the production build
npm run lint     # ESLint (eslint-config-next, flat config)
```

There is no test framework configured.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Firebase (Auth + Firestore + Storage) client SDK · Zustand for global selection state. Imports use the `@/*` path alias mapped to the app root, though much of the existing code uses relative paths. Icons come from `lucide-react`.

## Conventions

- **Write code comments and JSDoc in English.** UI strings and identifiers are already English. Much of the existing code has French comments: translate them to English whenever you edit a file for any reason (translate the comments in that file as part of the change), but don't open files solely to translate them.
- Service files (`lib/services/*-service.ts`) own all Firestore reads/writes for one collection. Components and hooks should call services, not Firestore directly — except real-time `onSnapshot` subscriptions, which hooks set up themselves (see `use-user-profile.ts`).
- Type definitions live in `lib/types/*.types.ts`, most re-exported from `lib/types/index.ts` (note `forecaster.types.ts` is imported directly, not via the barrel).
- `lib/format/*` holds pure, Firebase-free helpers (money formatting, `distribute()` for splitting a total across weights with exact-cent rounding, CSV (de)serialization, labs-penetration math). Reuse these instead of re-deriving the math in components.

## Design system (Plus Company brand)

The visual identity follows the Plus Company Brand Guidelines 2024. Everything is centralized in `app/globals.css`:

- The brand palette lives in `--plus-*` CSS variables (pink `#f2739e`, light pink `#f7b0c9`, green `#4db04f`, yellow `#ffc929`, red `#f54236`, light blue `#abebf2`, blue `#66d9e5`, purple `#594a99`, black).
- The Tailwind default color scales are **re-anchored onto the Plus palette** via `@theme` overrides (yellow/amber → Plus Yellow, red/rose → Plus Red, green/emerald/teal/lime → Plus Green, blue/sky/cyan → Plus Blue, purple/violet/indigo → Plus Purple, pink/fuchsia → Plus Pink). Writing `bg-yellow-400` or `text-red-700` anywhere automatically yields on-brand colors — prefer these utilities over raw hex values in components.
- Typeface is **Urbanist** (the guidelines' approved substitute for Gellix), loaded via `next/font` in `app/layout.tsx` as `--font-urbanist`.
- `.plus-pattern` is the signature color-stripe accent (sidebar top bar, page-header hairline, login page). Use it sparingly as a thin accent.
- The logo is an SVG recreation in `components/_shared/plus-logo.tsx` (also `app/icon.svg` for the favicon) — no raster logo assets.
- Chart colors come from `PLUS`/`CATEGORICAL_COLORS` in `components/dashboard/charts/colors.ts`; raw-hex chart palettes elsewhere should reuse those hexes.
- Black (`bg-gray-900`) surfaces (drawer headers, totals rows, tooltips) are intentional — Plus Black is part of the palette; black + Plus Yellow is an on-brand pairing.
- **Flat and square.** The whole radius scale is zeroed in `globals.css` (`rounded-*` renders square; `rounded-full` is reserved for functional circles: spinners, toggle-switch knobs). Surfaces are solid colors — no pale `*-50/-100` tint washes (status surfaces use flat `yellow-400`/`red-500`/`green-500`/`blue-200`/`purple-600` with contrast text), no `/NN` color alphas except modal scrims (`bg-black/40`), no backdrop-blur, and no decorative shadows on static cards/chips (floating overlays — menus, modals, tooltips, toasts — keep elevation).

## Architecture

### Auth & access control (entirely client-side)

`middleware.ts` is intentionally a no-op pass-through: Firebase Auth stores the session in localStorage (not cookies), so server-side route protection isn't possible without the Admin SDK + custom session cookies (planned "Phase 2", not yet built). **All route/role protection is client-side** and must be treated as UX, not a security boundary — real enforcement belongs in Firestore security rules. Those rules live in `firestoreRules.txt` and `storage.rules` (kept in sync by hand; deploy them with the Firebase console/CLI). When you change a collection's shape or who may read/write it, update that file too.

The chain:
1. `AuthProvider` (`lib/auth-context.tsx`) wraps the app and exposes `useAuth()`. Sign-in is Google only and restricted to company domains: `config/sign_in_domains` (the agencies' domains + the company-wide ones, kept in sync by `agency-service.ts`) — any other account is signed out and the login page shows a "staff only" message. On every sign-in it calls `ensureUserProfile()` (`user-service.ts`) to create/refresh the person's `users/{email}` doc.
2. `users/{email}` — one doc per person, keyed by **lowercase email** (`UserRecord` in `lib/types/access.types.ts`). `role` is `USER` (default) or `ADMIN` (set by hand); `disabled: true` is a soft revoke. A row grants nothing by itself. Admins may create rows before the person ever signs in (`createUserManually`); the first sign-in links the Auth `uid`. The self-created row is validated by the `users` rule's key whitelist — if you add a field `ensureUserProfile` writes, add it there.
3. `AccessProvider` / `useAccess()` (`lib/hooks/use-access.tsx`) subscribes to the person's row, their grant, the dashboard settings and the agency ↔ domain mapping, and exposes the resolved access (`hasAnyAccess`, `hasTeamSpaces`, open tabs, agency scopes, client queries). `app/(protected)/layout.tsx` redirects signed-out users to `/auth/login`, shows "Access pending"/"Access revoked" when there's nothing to open, and keeps people without team spaces on the Dashboard / How to / Resources.

**Where access comes from** — `lib/format/access.ts` is the pure reference logic; `firestoreRules.txt` (`isCompanyUser`, `isActive`, `canReadClientData`, `canWriteClient`, `editGrantCovers`, `canReadAgencyData`) and `storage.rules` mirror it. Change all three together.
1. **Client team** (`CL_Team_Emails`): read + edit that client's forecast, flags, milestones and product tracking (never actuals), the team spaces (Forecast, Flags, Milestones, Clients) and the Forecaster dashboard tab.
2. **Email domain**: every company email sees Media Investments, Labs Pacing and Reports (`AGENCY_DEFAULT_TABS`) for the agencies its domain maps to; a company-wide domain (`config/company_domains`, e.g. pluscompany.com) sees every agency, read-only.
3. **Grants** (`dashboard_grants/{email}`, `dashboard-grants-service.ts`): `tabs: {tabId: {allAgencies, agencies[], allRegions, regions[], edit?}}` — a rule (agency × region), not a client list, so new matching clients are included automatically. Read-only, except a Forecaster grant with `edit`, which writes like a team member and opens the team spaces. **Exec KPI** and **MediaBox Adoption** are grants only.
- **Admins** see and edit everything. **Disabled** users get nothing.

**Client teams.** A client's team is its GM (GM Pod name → accounts in `GM_POD_EMAILS`, `client.constants.ts`), `CL_Business_Lead`, `CL_Digital_Lead` (emails, picked from the `config/business_leads` / `config/digital_leads` lists) and `CL_Collaborators`. `computeTeamEmails` (`lib/format/client-team.ts`) flattens them into `CL_Team_Emails`, recomputed by `saveClient` and `commitCSVImport`; the Clients page's **Team access** button backfills every client (dry-run first). Read the team's clients with one `array-contains` query (the shape the rules can verify) via `fetchAccessibleClients` (team spaces: team + edit grant; admin → all) or `fetchReadableClients` (dashboard: also domain agencies and grants) in `assignment-service.ts`.

**Admin pages.** **Forecast Access** (`/admin/users`) shows one role per person (Admin > GM > BL > DL > Collaborator), allocates collaborator seats, and exports/imports the client teams as a Google Sheet (`lib/format/team-sheet.ts`). **Dashboard Access** (`/admin/dashboard-access`) edits grants, hides tabs/sub-tabs, adds new company users inline, holds the **Agencies & Domains** tab, and exports/imports an access report workbook (`lib/format/access-report.ts`, `grant-sheet.ts`). Old routes `/admin/agencies` and `/admin/dashboard-pages` redirect there.

### The forecast grid (the core feature)

All three data-entry axes — **Media, Revenue, Labs** — live on one unified page, `app/(protected)/forecast/page.tsx`, as switchable tabs sharing one generic grid engine. The grid is driven by an `AxisConfig` (declared in `forecaster.types.ts`, e.g. `MEDIA_AXIS_CONFIG`); the page just picks the active tab's config and renders. Older per-axis routes like `app/(protected)/media/page.tsx` are now thin `redirect()` stubs to `/forecast` — keep them so old links resolve. The Client/Year/RFQ selectors and the comparison selector sit at the top of this page (`forecast-selectors.tsx`), not in the sidebar.

Data model (`forecaster.types.ts`), three levels:
- **Category** (level 1): `BL_INPUT` (business-lead entries, grouped into buckets) vs `ADMIN_INPUT` (admin-only `actuals`).
- **Bucket** (level 2): a named group of rows (e.g. a project/campaign).
- **Row** (level 3): a typed row (`rowType` is a free string constrained per-axis by `AxisConfig.rowTypeOptions`) carrying a 12-month `MonthlyMap` of dollar values.

Storage — Firestore collection `data_entries`, one doc per `{client, year, rfqType}` triplet with ID `{cl_id}_{year}_{rfqType}` (`buildDataEntryId`). Each axis lives under `axes.{axisId}`, so saving one axis (`setDoc` with `merge: true`) never touches the others (`data-entry-service.ts`).

Editing flow (`use-forecaster-grid.ts`) — **explicit save**, not autosave:
- The active triplet comes from the global Zustand store (`forecast-selection.store.ts`), set via the sidebar selectors.
- On load, the axis data is fetched and copied into a local working copy; edits accumulate in a `dirtyMap` (cell key → value) plus a `structureDirty` flag. `Save` does a single Firestore write of the whole axis; `Discard` restores the snapshot.
- **Locking is owned by the RFQ doc, not the data:** a `selectedRFQ.status === "LOCKED"` makes the entire grid read-only for everyone. `actuals` (`ADMIN_INPUT`) are editable only by admins. The `rfqs` collection is subscribed in real-time so lock/unlock by an admin reflects instantly.
- RFQ comparison: a second axis can be loaded as reference; matching is by bucket name + rowType (IDs differ across docs).

### The Product axis (4th tab, no grid engine)

The `/forecast` page has a 4th tab, **Product** — always-on product tracking per client, with **no year/RFQ/monthly dimension** (it does not use `AxisConfig`/`useForecasterGrid`). For each product of the static catalog (`PRODUCTS` in `lib/types/product.types.ts`), the BL picks a pipeline status (`Identified Prospect → Pitched To Client → Approved / Rejected`; clicking the active status clears it), may add an optional `timing` (`"YYYY-MM"`, the month revenue should start) for any status except Rejected, and a free-text `note` (which may exist without a status — all entry fields are optional; an entry with no fields left loses its key). Storage: `product_tracking` collection, one doc per client (ID = `cl_id`), `products: Record<productId, {status?, timing?, note?}>`, saved wholesale (no merge — cleared statuses must disappear) via `product-tracking-service.ts`. RFQ locking doesn't apply; anyone who may write the client (team, Forecaster edit grant, admin) may write anytime. UI is `components/forecaster/product-grid.tsx` (same saving model as the grid axes: debounced `useAutosave` + manual Save/Discard); the tab only requires a selected client and hides the currency badge and notes/compare toggles; the RFQ timeline of the globally selected RFQ still shows.

### RFQs

`rfqs` collection, doc ID `{year}_{type}` (e.g. `2026_RFQ1`). Types are an ordered enum `RFQ0 → RFQ1 → RFQ2 → RFQ3 → FINAL` (`RFQ_TYPE_ORDER`, `sortRFQs`). Status is `UNLOCKED` / `LOCKED`. Admins manage RFQs in `app/(protected)/admin/rfqs`.

**Closed months (per-axis, admin-controlled):** each RFQ doc may carry `closedMonths: { media?, revenue?, labs?: number[] }`. A closed month is read-only for non-admins (admins are never restricted) — independent of the global `status` lock. Months are **never closed automatically**: an absent axis key means nothing is closed (the old per-RFQ-type default table — RFQ1→Q1, FINAL→whole year — was removed on request). Always read the effective set via `resolveClosedMonths(rfq, axisId)`. Admins toggle each month per axis from the RFQ admin page; writes go through `updateRFQAxisClosedMonths`.

### Clients

`clients` collection. Client field values (status, tier, agency, region, office, GM pod, fee structure) are constrained by sets in `lib/constants/client.constants.ts`. Import/export lives in `client-service.ts`, **Google Sheets first, CSV as fallback**: `buildClientTable`/`buildCommissionTable` feed both the CSV download and the Sheets export (`exportToNewSheet` in `table-export.ts`, same GIS transport as Bulk Edit; the client list gets in-sheet dropdowns from `clientColumnAllowedValues`). Export is visible to anyone with the team spaces (non-admins never get hidden clients); import is admin-only — paste a sheet link (`sheet-import-modal.tsx`) or upload a CSV. `validateClientTable()` is the shared dry run (no writes): it throws `ImportStructureError` for a wrongly-shaped table (missing/duplicated/renamed headers, header not on row 1, commission export pasted), ignores unknown columns with a warning, and validates rows against those sets; `commitCSVImport()` writes confirmed rows in batches of 500. Commission rates (`commission-service.ts`) are always stored monthly: `commissionsConfig[year][mediaType] = MonthlyMap`, with helpers to collapse/detect a uniform 12-month rate.

**Client status is per year.** `Client_Status_By_Year: Record<year, ClientStatus>` is canonical; the legacy scalar `Client_Status_2026` is kept only as a read-time fallback (pre-migration docs). Always resolve via `resolveClientStatus(client, year)` in `lib/format/client.ts` — never read the map directly. The Clients-page cards (badge labelled with its year) and status filter use `currentStatusYear()` — the calendar year, not the persisted dashboard year — so they roll over on Jan 1; the client drawer always lists this year and next (missing rows start at the resolved status, never a blind default). The CSV keeps a single `Client_Status_2026` column for round-trip simplicity: import maps it into `{2026: …}`, export writes the 2026-resolved status.

**Other client attributes (`lib/format/client.ts` helpers, admin-edited in `client-drawer.tsx`):**
- `CL_Hidden?` — when true the client is filtered out everywhere (dashboard via `use-accessible-clients`, forecast selectors) **except** the admin Clients page, where admins still see it with a "Hidden" badge and can unhide it. Non-admins never see hidden clients. Read via `isClientHidden`.
- `Forecasting_Type: {mediaSpend, labs, revenues}` — per-axis toggles, **stored attribute only** (no tab/dashboard gating yet). Defaults to all true (`DEFAULT_FORECASTING_TYPE`).
- `Labs_Eligibility?: Record<partnerId, boolean>` — sparse, **stored only** (no allocation filtering yet); absent = eligible. Read via `isEligibleForPartner`. The drawer lists partners from `labs-partner-service`, grouped by year. Unlike the other attributes it is editable by anyone who may write the client (`canWriteClient`: client team, Forecaster edit grant, Admin): a non-admin Save writes only this map via `saveClientLabsEligibility`, and the client update rule allows `Labs_Eligibility` next to `commissionsConfig`.

Because `setDoc(merge:true)` deep-merges maps (a removed key would linger), `saveClient` replaces the shrinkable maps (`Client_Status_By_Year`, `Labs_Eligibility`) with a follow-up `updateDoc` on edit.

### Dashboard (analytics, read-only)

The app's home page (`app/(protected)/page.tsx`) is a read-only analytics dashboard that aggregates forecast data across many clients, parallel to the per-client editing in `/forecast`. It lives under `lib/dashboard/*` (logic) and `components/dashboard/*` (UI), organized as three decoupled layers:

> **Merged layout.** The home page is the former "Forecaster" comparison dashboard (Looker replica): a CAD/USD toggle, primary/secondary BL/OF Type dropdowns, per-client focus, test-client exclusion, and six top-level tabs — **Forecaster** (sub-tabs Forecast Summary, Revenues, Media, Labs, Product), **Labs Pacing**, **Exec KPI Dashboard** (Media & Labs KPIs, Investment Strategy KPIs, Meta, Deal Pacing, Billups, Local Media — grants only), **Media Investments Report (Mediaocean)** (Media Investments, KPIs Media and Labs), **MediaBox Adoption**, **Reports (Raw Data Download)** (`FORECASTER_TABS` in `components/forecaster/forecaster-tabs.config.ts`, sub-tabs in `dashboard-pages.config.ts`; the shared strip is `components/forecaster/sub-tab-bar.tsx`, and Labs Pacing is one `labs-pacing-page.tsx` used by both its tab and the Exec sub-tab — the top-level tab passes `showGmSections={false}`, so Target vs Booked by Partner and the By GM Pod cards show only on Exec KPI → Deal Pacing; tab bodies in `components/forecaster/tabs/*`, section blocks in `components/forecaster/sections/*`). Forecast Summary (id `exec`) is a headline KPI band + `StrategyKpisSection` + flagship charts; Media Spend and Labs each open on the shared `ClientDetailTable` (via its `defaultView` prop) so a client can be focused. The older standalone Dashboard (four tabs Media/Revenue/Labs/Product) was folded into these tabs: its charts — monthly trends, Labs recap, MediaBox coverage, Region/Business-Lead breakdowns, best/worst ratios, expected timings — now render inside them, reusing the shared primitives in `components/dashboard/charts/*` plus `dimension-breakdown`, `mediabox-coverage-section`, `labs-recap-table`. The old `/forecaster` route is a `redirect("/")` stub.

- **Filters** (`lib/dashboard/filters/`): a faceted, cascading multi-select over the accessible clients. Everything is driven by the `FACETS` registry (`facets.ts`) — `use-dashboard-filters.ts` never names a facet; each facet's dropdown shows only values present among clients passing every *other* active facet. Add a filter by adding a `Facet` entry, nothing else.
- **Data** (`lib/dashboard/data/`): `useScopeForecastData(scope)` fetches one `data_entries` doc per in-scope client in parallel for the global Year + RFQ, merges the axes, and reshapes them via the pure functions in `aggregate.ts` into Media/Revenue/Labs breakdowns. A cancellation flag discards stale fetches when filters change mid-flight.
- **Widgets** (`lib/dashboard/widgets/`): shared chart primitives live in `components/dashboard/charts/`; the current tabs compose them directly (the older `WIDGETS`/`dashboard-grid` registry and the `components/dashboard/tabs/` wrappers were retired in the merge — the still-live tab UI is under `components/forecaster/`).

The dashboard reads the same global Year + RFQ from `forecast-selection.store.ts`; its client scope is local filter state, independent of the editing page's selected client. **Per-tab client universe** (presentation only — the rules govern reads): each tab shows the clients it covers for the person (`tabCoversClient` in `lib/format/access.ts`) — Forecaster: their team clients + Forecaster grant; Media Investments / Labs Pacing / Reports: their domain's agencies + that tab's grant; Exec KPI / MediaBox Adoption: that tab's grant only; Admin: all. `DashboardTabScope` tells `useAgencyScope` which tab is active. The filter bar, forecast data and charts follow the active tab's universe.

**Hidden pages.** Admins hide/unhide tabs and sub-tabs on Dashboard Access; stored in `config/dashboard_access` as `{hiddenTabs, hiddenSubtabs}` (`dashboard-access-service.ts`). Hidden pages disappear for **everyone, admins included** (`hiddenPagesFor`); Dashboard Access still lists them to unhide. Sub-tab lists live in `components/forecaster/dashboard-pages.config.ts` (ids `tab` or `tab/sub`; add a new sub-tab there, not in its container); `page.tsx` filters the tab bar with `isTabVisible` and passes `hidden` to the sub-tab containers, which fall back to their first visible sub-tab. Presentation only.

### Agency-partitioned data (MediaOcean + Reports tabs)

The **Media Investments Report (Mediaocean)** and **Reports** tabs are open to every company email and used across agencies, so their data is partitioned by agency and the partition is enforced by security rules, not the UI. Admin reads every agency; everyone else reads the agencies their email domain maps to — checked **live** against the `agencies` ↔ domains mapping (and company-wide domains), so a mapping change applies to everyone with no sync — plus the agencies of their grants on those tabs. This mirrors the former per-agency Looker dashboards: `@cossettemedia.com` → Cossette Media + Showroom, `@jungle-media.ca` → Jungle, `@mekanismmedia.com` → Mekanism, `@pluscompany.com` → all (company-wide domain). The scope is `tabAgencyScope` / `readableAgencyScope` in `lib/format/access.ts` (types in `lib/format/agency-scope.ts`), mirrored by `canReadAgencyData` in `firestoreRules.txt` and the agency checks in `storage.rules` — keep all three in sync. Rows whose agency isn't one of the app agencies are tagged `_unassigned` (Admin only).

- **Tagging happens at sync time.** `scripts/lib/agency.mjs` maps a raw agency value to the app agency names (`CLIENT_AGENCIES`). MIR and the MediaOcean tables use `AGENCY`; Billing Summary uses `PLUSCO_AGENCY` (its `AGENCY` is the buying entity).
- **MediaOcean collections** (`mo_kpi_by_client`, `mediaocean_investment_mix`, `social_partner_mix`) carry `_agency`. Read them only through `fetchAgencyScopedDocs` (`lib/dashboard/data/agency-scoped-query.ts`): whole collection for Admin, otherwise one `where("_agency", "==", a)` query per agency (rules reject unfiltered queries).
- **Reports** (MIR Raw Data, Billing Summary) never touch BigQuery from the app. The monthly sync publishes one gzipped, column-encoded snapshot per agency to Storage (`reports/{table}/{agency}/data.json.gz` + `reports/manifest.json`, encoder `scripts/lib/report-snapshot.mjs`, decoder `lib/dashboard/data/report-snapshot.ts` — keep the format in sync). The page downloads the user's files through the same-origin pass-through `app/api/report-file/route.ts` (it forwards the user's own ID token, so `storage.rules` still decide access; some networks block `firebasestorage.googleapis.com`), falling back to Storage directly, then filters/exports in memory. The direct fallback needs the bucket CORS config in `storage-cors.json`. The old Firestore mirrors `mir_raw` / `billing_summary_raw` are no longer written (remove leftovers with `scripts/drop-raw-mirrors.mjs --confirm`).
- There is no server-side BigQuery access in the app; only the sync scripts (run by the admins with their own credentials) read BigQuery.

## Firebase configuration

`lib/firebase.ts` hardcodes the client Firebase config for project `pluscoops` (this is the public web SDK config, normal to ship client-side). The file also has several `console.log` init lines. `.env*` is gitignored.
