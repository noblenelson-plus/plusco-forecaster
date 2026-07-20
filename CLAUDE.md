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

`middleware.ts` is intentionally a no-op pass-through: Firebase Auth stores the session in localStorage (not cookies), so server-side route protection isn't possible without the Admin SDK + custom session cookies (planned "Phase 2", not yet built). **All route/role protection is client-side** and must be treated as UX, not a security boundary — real enforcement belongs in Firestore security rules. Those rules live in `firestoreRules.txt` (kept in sync by hand; deploy them with the Firebase console/CLI). When you change a collection's shape or who may read/write it, update that file too.

The chain:
1. `AuthProvider` (`lib/auth-context.tsx`) wraps the app, exposes `useAuth()`, and on every auth state change calls `ensureUserProfile()` to create/update the Firestore `users/{uid}` doc (new users default to role `BUSINESS_LEAD`).
2. `useUserProfile()` subscribes in real-time to `users/{uid}` and derives `isAdmin`.
3. `app/(protected)/layout.tsx` redirects unauthenticated users to `/auth/login`, shows an "Access pending" screen for users with no assigned clients (and not admin), and renders the sidebar shell otherwise.
4. Two roles only: `ADMIN` and `BUSINESS_LEAD`. `resolvePermissions(role)` in `user.types.ts` is the single source for capability flags — admins can do everything; BLs can edit forecast inputs for accessible clients only.

A user's **accessible clients** come from two fields on the user doc, unioned:
- `assignedClients: string[]` — explicit per-client grants.
- `assignedAgencies: string[]` — agency-wide access: the user automatically sees **every** client whose `CL_Agency` is listed, *including clients added later*. This is not admin access — it is scoped to those agencies only.

Both are edited together in the admin users drawer (`user-clients-drawer.tsx` → `setUserAccess`). The single place that resolves the effective client list is `fetchAccessibleClients(profile, isAdmin)` in `assignment-service.ts` (admin → all; BL → assigned ∪ agency clients, deduped) — used by `use-accessible-clients.ts`, `forecast-selectors.tsx` and the Clients page. The reverse mapping (who can access a client) is computed in memory. Never duplicate assignments onto client docs. Firestore rules mirror this: `canAccessClient` / `isBLForClient` combine direct and agency access (`isAgencyAssignedForClient` looks up the client's `CL_Agency`).

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

The `/forecast` page has a 4th tab, **Product** — always-on product tracking per client, with **no year/RFQ/monthly dimension** (it does not use `AxisConfig`/`useForecasterGrid`). For each product of the static catalog (`PRODUCTS` in `lib/types/product.types.ts`), the BL picks a pipeline status (`Identified Prospect → Pitched To Client → Approved / Rejected`; clicking the active status clears it), may add an optional `timing` (`"YYYY-MM"`, the month revenue should start) for any status except Rejected, and a free-text `note` (which may exist without a status — all entry fields are optional; an entry with no fields left loses its key). Storage: `product_tracking` collection, one doc per client (ID = `cl_id`), `products: Record<productId, {status?, timing?, note?}>`, saved wholesale (no merge — cleared statuses must disappear) via `product-tracking-service.ts`. RFQ locking doesn't apply; any assigned BL or admin may write anytime. UI is `components/forecaster/product-grid.tsx` (same saving model as the grid axes: debounced `useAutosave` + manual Save/Discard); the tab only requires a selected client and hides the currency badge and notes/compare toggles; the RFQ timeline of the globally selected RFQ still shows.

### RFQs

`rfqs` collection, doc ID `{year}_{type}` (e.g. `2026_RFQ1`). Types are an ordered enum `RFQ0 → RFQ1 → RFQ2 → RFQ3 → FINAL` (`RFQ_TYPE_ORDER`, `sortRFQs`). Status is `UNLOCKED` / `LOCKED`. Admins manage RFQs in `app/(protected)/admin/rfqs`.

**Closed months (per-axis, admin-controlled):** each RFQ doc may carry `closedMonths: { media?, revenue?, labs?: number[] }`. A closed month is read-only for Business Leads (admins are never restricted) — independent of the global `status` lock. Months are **never closed automatically**: an absent axis key means nothing is closed (the old per-RFQ-type default table — RFQ1→Q1, FINAL→whole year — was removed on request). Always read the effective set via `resolveClosedMonths(rfq, axisId)`. Admins toggle each month per axis from the RFQ admin page; writes go through `updateRFQAxisClosedMonths`.

### Clients

`clients` collection. Client field values (status, tier, agency, region, office, GM pod, fee structure) are constrained by sets in `lib/constants/client.constants.ts`. CSV import/export lives in `client-service.ts`: `validateCSV()` is a dry run (no writes) that validates against those sets, and `commitCSVImport()` writes confirmed rows in batches of 500. Commission rates (`commission-service.ts`) are always stored monthly: `commissionsConfig[year][mediaType] = MonthlyMap`, with helpers to collapse/detect a uniform 12-month rate.

**Client status is per year.** `Client_Status_By_Year: Record<year, ClientStatus>` is canonical; the legacy scalar `Client_Status_2026` is kept only as a read-time fallback (pre-migration docs). Always resolve via `resolveClientStatus(client, year)` in `lib/format/client.ts` — never read the map directly. The status badge and the Clients-page filter follow the globally selected year (`forecast-selection.store`, fallback current year). The CSV keeps a single `Client_Status_2026` column for round-trip simplicity: import maps it into `{2026: …}`, export writes the 2026-resolved status.

**Other client attributes (`lib/format/client.ts` helpers, admin-edited in `client-drawer.tsx`):**
- `CL_Hidden?` — when true the client is filtered out everywhere (dashboard via `use-accessible-clients`, forecast selectors) **except** the admin Clients page, where admins still see it with a "Hidden" badge and can unhide it. BLs never see hidden clients. Read via `isClientHidden`.
- `Forecasting_Type: {mediaSpend, labs, revenues}` — per-axis toggles, **stored attribute only** (no tab/dashboard gating yet). Defaults to all true (`DEFAULT_FORECASTING_TYPE`).
- `Labs_Eligibility?: Record<partnerId, boolean>` — sparse, **stored only** (no allocation filtering yet); absent = eligible. Read via `isEligibleForPartner`. The drawer lists partners from `labs-partner-service`, grouped by year.

Because `setDoc(merge:true)` deep-merges maps (a removed key would linger), `saveClient` replaces the shrinkable maps (`Client_Status_By_Year`, `Labs_Eligibility`) with a follow-up `updateDoc` on edit.

### Dashboard (analytics, read-only)

The app's home page (`app/(protected)/page.tsx`) is a read-only analytics dashboard that aggregates forecast data across many clients, parallel to the per-client editing in `/forecast`. It lives under `lib/dashboard/*` (logic) and `components/dashboard/*` (UI), organized as three decoupled layers:

- **Filters** (`lib/dashboard/filters/`): a faceted, cascading multi-select over the accessible clients. Everything is driven by the `FACETS` registry (`facets.ts`) — `use-dashboard-filters.ts` never names a facet; each facet's dropdown shows only values present among clients passing every *other* active facet. Add a filter by adding a `Facet` entry, nothing else.
- **Data** (`lib/dashboard/data/`): `useScopeForecastData(scope)` fetches one `data_entries` doc per in-scope client in parallel for the global Year + RFQ, merges the axes, and reshapes them via the pure functions in `aggregate.ts` into Media/Revenue/Labs breakdowns. A cancellation flag discards stale fetches when filters change mid-flight.
- **Widgets** (`lib/dashboard/widgets/`): the `WIDGETS` registry renders cards/charts in order; add one by dropping a `{ scope }` component under `components/dashboard/widgets/` and registering it. Tab content lives in `components/dashboard/tabs/` (Media/Revenue/Labs), charts in `components/dashboard/charts/`.

The dashboard reads the same global Year + RFQ from `forecast-selection.store.ts`; its client scope is local filter state, independent of the editing page's selected client.

## Firebase configuration

`lib/firebase.ts` hardcodes the client Firebase config for project `pluscoops` (this is the public web SDK config, normal to ship client-side). The file also has several `console.log` init lines. `.env*` is gitignored.
