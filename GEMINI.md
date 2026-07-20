# GEMINI.md — Working brief for adding visualizations to the Plus Forecaster

You are helping a developer (Noble) add **data visualizations** to an existing,
production Next.js application. This file is your context. Read it fully before
writing any code. Your #1 job is to **add value without breaking what already
works**. When in doubt, ask a clarifying question or propose a plan before
editing.

---

## 0. Prime directive & guardrails

**Add, don't rewrite.** Charts are new leaf features layered on top of an
existing, working data pipeline and design system. You should almost never need
to modify the data layer, the forecast grid, Firestore services, or the auth
system to add a chart.

Hard rules — do NOT do any of these without the developer explicitly asking:

- ❌ Do **not** modify anything under `lib/services/**` (Firestore reads/writes),
  `lib/hooks/use-forecaster-grid.ts`, `components/forecaster/**` (the editing
  grid), `lib/auth-context.tsx`, `middleware.ts`, or `firestoreRules.txt`.
- ❌ Do **not** change existing type definitions in `lib/types/*.types.ts`. Read
  them; don't edit them. If a type is missing a field you need, that's a signal
  to compute it in the aggregation layer, not to mutate the stored shape.
- ❌ Do **not** write to Firestore from a chart/component. Visualizations are
  **read-only**. All reads go through existing hooks/services.
- ❌ Do **not** change how data is fetched or aggregated
  (`lib/dashboard/data/**`) unless a chart genuinely needs a new derived shape —
  and if so, **add a new pure function**, don't alter existing ones (other
  charts and the QA checks depend on them).
- ❌ Do **not** introduce a new chart library. **Recharts is already installed
  and is the only charting dependency.** Don't add D3, Chart.js, Nivo, etc.
- ❌ Do **not** hardcode hex colors. Use the shared palette (see §7).
- ❌ Do **not** delete, rename, or "clean up" existing files/exports as a side
  effect. Keep diffs minimal and scoped to the feature.

Every change must leave the app **building and type-checking cleanly** (see §9).

---

## 1. Stack & how to run it

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS v4**
- **Firebase** (Auth + Firestore) client SDK · **Zustand** for global selection state
- **Recharts ^3.8** for charts · **lucide-react** for icons
- A small **shadcn/ui**-style primitive set lives in `components/ui/`
  (`card`, `chart`, `table`, `tabs`, `button`, `badge`).

**The app lives in the `plusco-forecaster/` subdirectory. Run all commands from
there.** (The workspace-root `package.json` is unrelated.)

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build — the real gate
npm run lint     # ESLint (eslint-config-next, flat config)
```

There is **no test framework**. Verification = type-check + lint + build + a
visual check in the browser.

**Branching & git workflow.** `master` is the single source of truth and is kept
up to date. Always start a feature from a fresh `master` and work on a
short-lived branch — never commit visualization work directly onto `master`, and
never resurrect an old branch:

```bash
git checkout master
git pull                                  # get the latest master
git checkout -b noble/<feature>           # e.g. noble/revenue-trend-chart
# …work, commit small logical steps…
git push -u origin noble/<feature>        # push early so nothing lives only locally
```

Open a PR into `master` when the feature is ready. Push your branch to the remote
the same day you create it — unpushed local commits are invisible to everyone and
easy to lose. Keep one branch per feature; delete it after it merges.

Imports may use the `@/*` alias (→ app root) or relative paths; the existing
dashboard code mostly uses **relative paths** — match the file you're editing.

---

## 2. Where visualization code lives (your map)

```
app/(protected)/page.tsx                 ← the Dashboard page: context bar + filters + tabs
components/dashboard/
  tabs/                                  ← ONE component per dashboard tab; charts are composed here
    media-spend-tab.tsx
    revenue-tab.tsx
    labs-tab.tsx
    product-tab.tsx
    dashboard-tabs.config.ts             ← the tab registry (id, label, icon)
    tab-states.tsx                       ← shared Loading / NoContext / EmptyData notices
  charts/                                ← REUSABLE chart building blocks (this is your toolbox)
    chart-card.tsx                       ← card shell (title + subtitle + icon) around a chart
    stat-card.tsx                        ← KPI tile (value + label + optional variance pill)
    donut-chart.tsx
    bar-list.tsx
    horizontal-stacked-bar.tsx
    stacked-bar-chart.tsx
    trend-chart.tsx                      ← area (1 series) / multi-line (n series)
    colors.ts                            ← THE palette. Always import hues from here.
    format.ts                            ← formatCompactMoney(), formatPct()
  *-data-table.tsx                       ← per-client detail tables (with CSV export)
  dimension-breakdown.tsx                ← group totals by client attribute (region, BL, …)
lib/dashboard/
  data/
    use-scope-forecast-data.ts           ← THE data hook: fetch + CAD-normalize + aggregate
    aggregate.ts                         ← pure reshape helpers → the breakdowns charts consume
    use-scope-mediabox-totals.ts
    use-scope-product-tracking.ts
    qa-checks.ts
  filters/                              ← faceted client-scope filtering (usually leave alone)
  widgets/
    registry.ts                          ← optional widget registry (card/chart auto-grid)
    widget.types.ts                      ← DashboardScope + DashboardWidget contracts
```

**Two ways visualizations are added — prefer the first:**

1. **Add a chart to an existing tab** (most common). The tab already receives the
   fully-aggregated `data: ScopeForecastData`. You just pick a breakdown off it
   and drop a chart into the JSX inside a `<ChartCard>`.
2. **Add a self-contained widget** via `lib/dashboard/widgets/registry.ts` — a
   component taking `{ scope }` that fetches its own data. Use this for a card
   that doesn't belong to a specific tab.

---

## 3. The data model (what the numbers are)

Everything is **monthly dollar amounts**. The atomic type is:

```ts
type MonthlyMap = Record<number, number>;   // keys 1..12 (Jan..Dec), values = dollars
```

Helpers you'll use constantly (from `lib/types/common.types.ts`):
`MONTHS` (the array `[1..12]`), `sumMonthlyMap(map)`, `MEDIA_TYPES`,
`type MediaType` (`"social" | "programmatic" | "sem" | "digitalDirect" | "ooh" |
"print" | "tv" | "radio"`).

There are **three forecast axes**: **Media**, **Revenue**, **Labs** (plus a
separate non-monthly **Product** tracking). Each axis is stored as `AxisData`:

```ts
interface AxisData {
  buckets: ForecastBucket[];   // BL_INPUT — business-lead forecast, grouped into "buckets" (projects)
  actuals: ForecastRow[];      // ADMIN_INPUT — reference/actuals rows
}
// a ForecastRow carries: rowId, label, rowType (a per-axis string), months: MonthlyMap
```

- **BL_INPUT** = the editable forecast (what business leads submit).
- **ADMIN_INPUT / actuals** = reference data. On **Media/Labs** these actuals are
  called **"MediaOcean"** (annual, one shared doc per client+year); there is also
  a synced read-only **"MediaBox"** spend dataset. On **Revenue** the reference is
  called **"GAIA"** (per-submission), and there is **no MediaBox**.

**Context comes from two things (global Zustand state):**
- **Scope** = the set of client IDs selected by the dashboard filters.
- **Submission context** = the selected **Year** + **RFQ** (an RFQ is a named
  forecast round: `RFQ0 → RFQ1 → RFQ2 → RFQ3 → FINAL`).

You almost never touch raw `AxisData` in a chart — you consume the **breakdowns**
the data hook produces (next section).

---

## 4. The dashboard data pipeline (where your data comes from)

`useScopeForecastData(scope, currencyByClient, usdToCad, months)` in
`lib/dashboard/data/use-scope-forecast-data.ts` is the single source of truth for
dashboard chart data. It:

1. Fetches one document per in-scope client (in parallel) for the Year + RFQ.
2. **Normalizes every client to CAD** (USD clients × the year's rate). The
   dashboard always reports in **CAD**.
3. Optionally masks to a month subset.
4. Reshapes everything (via the **pure** functions in `aggregate.ts`) into ready
   -to-render breakdowns.

It returns a `ScopeForecastData` object. The fields you'll actually chart:

| Field | Shape | Use for |
|---|---|---|
| `media` | `MediaBreakdown` | Media charts: `.byChannel` (per-type slices w/ `annual`, `color`, `label`), `.monthly`, `.monthlyByType`, `.digitalMonthly`, `.traditionalMonthly`, `.totalAnnual`, `.digitalShare` |
| `mediaByClient` | `ClientMediaBreakdown[]` | per-client media tables / "top N clients" |
| `revenue` | `RevenueBreakdown` | Revenue charts: `.byStream` (slices w/ `annual`, `color`, `label`), `.monthlyByStream`, `.monthly`, `.totalAnnual` |
| `revenueByMode` | `{ blSubmission, official }` | the two revenue definitions (per-stream vs single "Official Revenue" line) |
| `labs` | `LabsPenetrationResult` | Labs penetration metrics |
| `labsMonthly` | `MonthlyMap` | Labs monthly total |
| `labsDetail` | `LabsDetailRow[]` | per-client × per-partner Labs table |
| `clientCount` / `clientsWithData` | `number` | KPI subtitles |
| `hasContext` / `loading` | `boolean` | gating (see below) |

Each slice already carries its **brand color** (from `colors.ts`), so a donut /
bar / legend for the same media type or revenue stream stays the same hue across
every chart. **Reuse `slice.color` — don't reassign colors.**

The dashboard also computes a **comparison** `ScopeForecastData` (another Year+RFQ)
for variance pills on `StatCard`s. If you add a KPI, wire its variance the same way
existing ones do (see `media-spend-tab.tsx`'s `getVariance` helper) — don't invent
a second comparison mechanism.

**If you need a new derived shape:** add a new **pure, Firebase-free** function to
`aggregate.ts` (input: `AxisData` or an existing breakdown; output: your shape).
Do not fetch inside it, and do not modify existing exported functions.

---

## 5. Gating: every tab/chart must handle three states

Follow the existing pattern (see the top of any tab component):

```tsx
if (!data.hasContext) return <NoContextNotice />;   // no Year/RFQ selected
if (data.loading)     return <LoadingTab />;        // still fetching
if (data.media.totalAnnual === 0) return <EmptyDataNotice />;  // nothing to show
```

Also guard individual charts: if a series is empty, render a small muted
"No … in scope." message instead of an empty chart frame.

---

## 6. How to build a chart (conventions)

**Prefer composing an existing chart component** (`DonutChart`, `BarList`,
`TrendChart`, `StackedBarChart`, `HorizontalStackedBar`) inside a `<ChartCard>`.
Only drop to raw Recharts when none of them fit.

Chart component prop conventions (already established — match them):
- Series are `{ label, color, points: number[] }` (12 points, index 0 = Jan) for
  time series, or `{ label, value, color }` for categorical.
- Pass a `valueFormat` = `formatCompactMoney` (money) or `formatPct` (ratios).
- Convert a `MonthlyMap` to points with `MONTHS.map((m) => map[m] ?? 0)`.

If you must write raw Recharts, wrap it in the shared **`ChartContainer`** from
`components/ui/chart` with a `ChartConfig` (keyed by a slug), and use
`var(--color-<key>)` for series colors + `ChartTooltip`/`ChartLegend` — see
`trend-chart.tsx` for the canonical example. This keeps tooltip/legend/colors in
sync and theme-aware. Charts are `"use client"` components.

Every chart sits inside a `<ChartCard title subtitle icon>` for a consistent
surface. KPI numbers use `<StatCard>`.

---

## 7. Design system (Plus Company brand) — non-negotiable

The visual identity is centralized in `app/globals.css` and the palette in
`components/dashboard/charts/colors.ts`. Respect it:

- **Always import colors from `charts/colors.ts`. Never hardcode hex in a chart.**
  - `PLUS` — the raw brand hues (pink, lightPink, green, yellow, red, lightBlue,
    blue, purple, black).
  - `MEDIA_TYPE_COLORS`, `REVENUE_STREAM_COLORS`, `PRODUCT_STATUS_COLORS` — fixed
    per-category maps (so a category keeps its hue everywhere).
  - `CATEGORICAL_COLORS` — cycle this for ad-hoc breakdowns (regions, business
    leads) with `CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]`.
  - Semantic: `POSITIVE_COLOR` (green), `NEGATIVE_COLOR` (red), `NEUTRAL_FILL`,
    `TRACK_COLOR`, `DIGITAL_COLOR`, `TRADITIONAL_COLOR`, `ACCENT`.
- **Tailwind color scales are re-anchored onto the Plus palette** in `globals.css`
  (`bg-yellow-400`, `text-red-700`, `bg-blue-200`, etc. already render on-brand).
  Prefer these utilities over raw hex in component chrome.
- **No orange, ever.** (MediaOcean's accent is **pink**, not orange.)
- **Yellow means "warning" in UI chrome** (badges, alerts, status). Do not use
  yellow for a "good/positive" signal. Note: in the *categorical chart palette*
  yellow is a legitimate data hue (e.g. `social`, `retainer`) — that's fine
  because it's identity, not status. Keep the two uses separate.
- **Flat and square.** The border-radius scale is zeroed globally (`rounded-*`
  renders square; `rounded-full` only for real circles like spinner dots).
  Surfaces are solid colors — **no pale `-50/-100` tint washes**, no color alphas
  (except modal scrims), no backdrop-blur, and **no decorative shadows on static
  cards/chips** (floating overlays like tooltips/menus keep elevation).
- **Black + Plus Yellow** is an intentional on-brand pairing (e.g. dark section
  bands). Black surfaces (`bg-gray-900`) are deliberate.
- Typeface is **Urbanist** (already loaded globally — don't set fonts).

---

## 8. Coding conventions

- **Write all code comments and JSDoc in English.** UI strings are English.
- **Services own Firestore.** Components/hooks call services; they never import
  `firebase/firestore` directly (except real-time `onSnapshot` inside a hook).
  For visualizations you should be **reading through the existing dashboard
  hooks**, not adding new Firestore access at all.
- **Types** live in `lib/types/*.types.ts`; **pure helpers** (money math, splits,
  CSV) live in `lib/format/*` — reuse them, don't re-derive math in a component.
- **React 19 / hooks:** do **not** call `setState` synchronously inside a
  `useEffect` body (the lint config flags it as an error). For data fetching, set
  state inside the async callback / `.then()`, and use a `cancelled` flag in the
  cleanup (copy the pattern in `use-scope-forecast-data.ts`). To reset state when
  a prop changes, adjust it during render with a "previous value" state, not an
  effect.
- Keep new files small and single-purpose; match the structure/naming of the
  neighbouring files you're extending.

---

## 9. Verification checklist (run before declaring done)

From `plusco-forecaster/`:

1. **Type-check:** `npx tsc --noEmit` → must be clean.
2. **Lint the files you touched:** `npx eslint <path> …` → introduce **no new**
   errors/warnings (some pre-existing ones exist in the repo; don't add more).
3. **Build:** `npm run build` → must succeed.
4. **Visual check:** `npm run dev`, open the dashboard, select a Client scope +
   Year + RFQ, and confirm your chart renders, handles empty/loading states, uses
   on-brand colors, and is responsive (no horizontal page scroll; charts scroll
   inside their own container if needed).

Acceptance criteria for any visualization change:
- Reads only (no writes), consumes existing breakdowns.
- No edits to services, stored types, the forecast grid, or auth.
- Colors from `colors.ts`; formatting via `format.ts`.
- Handles no-context / loading / empty. Numbers are in CAD.
- `tsc` + `build` clean; no new lint issues.

---

## 10. Copy-paste template — add a chart to an existing tab

```tsx
// Inside e.g. components/dashboard/tabs/media-spend-tab.tsx, in the returned JSX.
// `data: ScopeForecastData` is already a prop of the tab.

import ChartCard from "../charts/chart-card";
import DonutChart from "../charts/donut-chart";
import { formatCompactMoney } from "../charts/format";
// colors already live on each slice — no color import needed here.

// ...inside the component body, after the gating guards:
const channels = data.media.byChannel.filter((c) => c.annual > 0);

// ...in the JSX:
<ChartCard
  title="Channel mix"
  subtitle="Annual BL spend by media channel"
  icon={TrendingUp}
  className="lg:col-span-2"
>
  {channels.length > 0 ? (
    <DonutChart
      segments={channels.map((c) => ({
        label: c.label,
        value: c.annual,
        color: c.color,           // reuse the slice's brand hue
      }))}
      centerValue={formatCompactMoney(data.media.totalAnnual)}
      centerLabel="Total"
      valueFormat={formatCompactMoney}
    />
  ) : (
    <p className="py-8 text-center text-xs text-muted-foreground">
      No spend in scope.
    </p>
  )}
</ChartCard>
```

If you instead need a new breakdown shape, add a pure function to
`lib/dashboard/aggregate.ts`, surface it on `ScopeForecastData` in
`use-scope-forecast-data.ts` (as a new field — don't change existing ones), then
consume it in the tab.

---

**When a request is ambiguous** (which tab? which metric? BL forecast vs Official
revenue? annual vs monthly?), **ask before coding.** A wrong assumption here means
a chart that shows the wrong number — worse than no chart.
