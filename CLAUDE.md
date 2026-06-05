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

## Architecture

### Auth & access control (entirely client-side)

`middleware.ts` is intentionally a no-op pass-through: Firebase Auth stores the session in localStorage (not cookies), so server-side route protection isn't possible without the Admin SDK + custom session cookies (planned "Phase 2", not yet built). **All route/role protection is client-side** and must be treated as UX, not a security boundary — real enforcement belongs in Firestore security rules. Those rules live in `firestoreRules.txt` (kept in sync by hand; deploy them with the Firebase console/CLI). When you change a collection's shape or who may read/write it, update that file too.

The chain:
1. `AuthProvider` (`lib/auth-context.tsx`) wraps the app, exposes `useAuth()`, and on every auth state change calls `ensureUserProfile()` to create/update the Firestore `users/{uid}` doc (new users default to role `BUSINESS_LEAD`).
2. `useUserProfile()` subscribes in real-time to `users/{uid}` and derives `isAdmin`.
3. `app/(protected)/layout.tsx` redirects unauthenticated users to `/auth/login`, shows an "Access pending" screen for users with no assigned clients (and not admin), and renders the sidebar shell otherwise.
4. Two roles only: `ADMIN` and `BUSINESS_LEAD`. `resolvePermissions(role)` in `user.types.ts` is the single source for capability flags — admins can do everything; BLs can edit forecast inputs for assigned clients only.

User↔client assignment is stored **only** as `assignedClients: string[]` on the user doc (`assignment-service.ts`); the reverse mapping is computed in memory. Never duplicate it onto client docs.

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

### RFQs

`rfqs` collection, doc ID `{year}_{type}` (e.g. `2026_RFQ1`). Types are an ordered enum `RFQ0 → RFQ1 → RFQ2 → RFQ3 → FINAL` (`RFQ_TYPE_ORDER`, `sortRFQs`). Status is `UNLOCKED` / `LOCKED`. Admins manage RFQs in `app/(protected)/admin/rfqs`.

### Clients

`clients` collection. Client field values (status, tier, agency, region, office, GM pod, fee structure) are constrained by sets in `lib/constants/client.constants.ts`. CSV import/export lives in `client-service.ts`: `validateCSV()` is a dry run (no writes) that validates against those sets, and `commitCSVImport()` writes confirmed rows in batches of 500. Commission rates (`commission-service.ts`) are always stored monthly: `commissionsConfig[year][mediaType] = MonthlyMap`, with helpers to collapse/detect a uniform 12-month rate.

### Dashboard (analytics, read-only)

The app's home page (`app/(protected)/page.tsx`) is a read-only analytics dashboard that aggregates forecast data across many clients, parallel to the per-client editing in `/forecast`. It lives under `lib/dashboard/*` (logic) and `components/dashboard/*` (UI), organized as three decoupled layers:

- **Filters** (`lib/dashboard/filters/`): a faceted, cascading multi-select over the accessible clients. Everything is driven by the `FACETS` registry (`facets.ts`) — `use-dashboard-filters.ts` never names a facet; each facet's dropdown shows only values present among clients passing every *other* active facet. Add a filter by adding a `Facet` entry, nothing else.
- **Data** (`lib/dashboard/data/`): `useScopeForecastData(scope)` fetches one `data_entries` doc per in-scope client in parallel for the global Year + RFQ, merges the axes, and reshapes them via the pure functions in `aggregate.ts` into Media/Revenue/Labs breakdowns. A cancellation flag discards stale fetches when filters change mid-flight.
- **Widgets** (`lib/dashboard/widgets/`): the `WIDGETS` registry renders cards/charts in order; add one by dropping a `{ scope }` component under `components/dashboard/widgets/` and registering it. Tab content lives in `components/dashboard/tabs/` (Media/Revenue/Labs), charts in `components/dashboard/charts/`.

The dashboard reads the same global Year + RFQ from `forecast-selection.store.ts`; its client scope is local filter state, independent of the editing page's selected client.

## Firebase configuration

`lib/firebase.ts` hardcodes the client Firebase config for project `pluscoops` (this is the public web SDK config, normal to ship client-side). The file also has several `console.log` init lines. `.env*` is gitignored.
