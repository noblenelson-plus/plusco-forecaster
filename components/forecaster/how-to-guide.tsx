// components/forecaster/how-to-guide.tsx
"use client";

/**
 * How-to guide — the content of the "How to" page (main sidebar).
 *
 * A chaptered, step-by-step manual aimed at someone who has never used the
 * platform. Instead of one long page, it splits into short focused chapters with
 * a grouped rail menu (a select on small screens) and quick search, so it stays
 * light to navigate. The content mirrors the real workflow and uses the same
 * visual language as the app (yellow accent, inline UI chips, lucide icons) so
 * the instructions match what the reader sees on screen.
 *
 * Purely presentational: no data, no Firebase. The only outward interaction is
 * the optional `onJump` callback — the How-to page wires it to navigate to
 * /forecast?tab=… so the guide can send the reader straight to an axis tab.
 */

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  TrendingUp,
  DollarSign,
  FlaskConical,
  GitCompareArrows,
  ChevronRight,
  AlertTriangle,
  Percent,
  Plus,
  Trash2,
  Lock,
  Unlock,
  RotateCcw,
  FolderPlus,
  SplitSquareHorizontal,
  Download,
  Info,
  Sparkles,
  Target,
  Pencil,
  MousePointerClick,
  CheckCircle2,
  Keyboard,
  Lightbulb,
  HelpCircle,
  ArrowRight,
  ListChecks,
  Save,
  Search,
  StickyNote,
  X,
  CornerDownRight,
} from "lucide-react";

type AxisTab = "media" | "revenue" | "labs";

interface HowToGuideProps {
  /** Jump to another forecast tab (wired to the page's tab switcher). */
  onJump?: (tab: AxisTab) => void;
}

/** Context handed to each chapter body so it can deep-link around. */
interface ChapterCtx {
  onJump?: (tab: AxisTab) => void;
  /** Navigate to another chapter by id. */
  go: (id: string) => void;
}

interface Chapter {
  id: string;
  label: string;
  icon: typeof BookOpen;
  /** Free-text terms that should surface this chapter in quick search. */
  keywords?: string;
  body: (ctx: ChapterCtx) => React.ReactNode;
}

interface ChapterGroup {
  title: string;
  chapters: Chapter[];
}

// ─── Chapters, grouped for the menu ──────────────────────────────────────────

const GROUPS: ChapterGroup[] = [
  {
    title: "Getting started",
    chapters: [
      {
        id: "overview",
        label: "Overview",
        icon: BookOpen,
        keywords: "submission client year rfq axes media revenue labs autosave save start intro begin what is",
        body: ({ onJump }) => (
          <>
            <Lead>
              A forecast here is always tied to one <strong>submission</strong> —
              a <Chip>Client</Chip> × <Chip>Year</Chip> × <Chip>RFQ</Chip>{" "}
              (a forecasting round). Everything you type belongs to that single
              submission, and each submission has three tabs:
            </Lead>
            <div className="grid gap-3 sm:grid-cols-3">
              <AxisCard
                icon={TrendingUp}
                title="Media Spend"
                desc="Planned spend per media type, month by month. The backbone — Labs coverage and Revenue commission both build on it."
                onClick={onJump ? () => onJump("media") : undefined}
              />
              <AxisCard
                icon={FlaskConical}
                title="Labs"
                desc="Investment with Labs partners, tracked against planned media."
                onClick={onJump ? () => onJump("labs") : undefined}
              />
              <AxisCard
                icon={DollarSign}
                title="Revenue"
                desc="Agency revenue lines. Commission is auto-calculated from Media Spend."
                onClick={onJump ? () => onJump("revenue") : undefined}
              />
            </div>
            <Callout tone="info" icon={Save} title="Edits autosave">
              Changes save on their own a moment after you stop typing — the
              toolbar shows <em>Unsaved — autosaving…</em>, then{" "}
              <em>Saving…</em>, then <em>Saved</em>. Press <SaveChip /> to force
              an immediate write, or <Chip icon={RotateCcw}>Discard</Chip> to
              restore the last saved state.
            </Callout>
          </>
        ),
      },
      {
        id: "context",
        label: "Set your context",
        icon: MousePointerClick,
        keywords: "client year rfq selector pick choose search assigned lock unlock locked round empty checklist",
        body: () => (
          <>
            <Lead>
              On the <strong>Forecast</strong> page, use the three selectors at
              the top. Until all three are set, the grid stays empty and shows a
              checklist of what&apos;s missing.
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Client</strong> — click{" "}
                <Chip icon={null}>Select client…</Chip> and search by name. You
                only see clients assigned to you (admins see all).
              </Step>
              <Step n={2}>
                <strong>Year</strong> — only years that have RFQs appear.
              </Step>
              <Step n={3}>
                <strong>RFQ</strong> — the round. The icon shows its state:{" "}
                <IconText icon={Unlock} className="text-emerald-500">
                  unlocked
                </IconText>{" "}
                (editable) or{" "}
                <IconText icon={Lock} className="text-red-500">
                  locked
                </IconText>{" "}
                (read-only for everyone).
              </Step>
            </Steps>
            <Callout tone="tip" icon={Lightbulb} title="One context, all tabs">
              The Client / Year / RFQ applies to Media Spend, Labs, and Revenue
              at once. Switch tabs freely — you stay on the same submission.
            </Callout>
            <Note>
              Next to the selectors, a badge shows the <strong>currency</strong>{" "}
              this client forecasts in (CAD or USD) — amounts you type are in
              that currency. If the RFQ has scheduled periods, a{" "}
              <strong>timeline bar</strong> pinned to the bottom of the page
              shows where the round stands today.
            </Note>
          </>
        ),
      },
      {
        id: "grid",
        label: "Read the grid",
        icon: ListChecks,
        keywords: "project bucket row total months columns actuals mediaocean mediabox reference data bl submission closed period lock read only anatomy table layout sections",
        body: () => (
          <>
            <Lead>
              The Media Spend and Labs tables share one layout: rows on the
              left, the 12 months (Jan → Dec) across the top, a{" "}
              <strong>Total</strong> column on the right, and a{" "}
              <strong>Notes</strong> column you can show or hide. The table is
              split into two labelled sections:
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>BL SUBMISSION</strong> — your editable forecast.{" "}
                <strong>Projects</strong> (named groups, e.g. campaigns) each
                hold typed rows (a media type, or a Labs partner) with 12
                monthly amounts; the black{" "}
                <Chip icon={null}>BL Submission · current submission</Chip> row
                sums every project, per month and for the year.
              </Step>
              <Step n={2}>
                <strong>REFERENCE DATA</strong> — read-only context under your
                forecast. <em>MediaOcean</em> holds the booked numbers
                (admin-entered, one annual set per year); <em>MediaBox</em> is
                synced automatically and expands per campaign. Business Leads
                can&apos;t edit either.
              </Step>
            </Steps>
            <Callout tone="info" icon={Lock} title="Closed periods">
              A month with a <Lock size={12} className="inline align-middle" />{" "}
              lock in its header is a closed period (set per axis by admins) —
              those cells are frozen for Business Leads so past months
              can&apos;t change.
            </Callout>
            <Note>
              Read-only cells aren&apos;t dead ends: click one to copy its value
              to the clipboard.
            </Note>
          </>
        ),
      },
    ],
  },
  {
    title: "Entering data",
    chapters: [
      {
        id: "media",
        label: "Enter Media Spend",
        icon: TrendingUp,
        keywords: "add project add row media type enter amounts type numbers cells bucket new campaign delete remove",
        body: ({ onJump, go }) => (
          <>
            <Lead>
              On the <Chip icon={TrendingUp}>Media Spend</Chip> tab, build the
              plan from the top down.
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Add a project.</strong> Click{" "}
                <Chip icon={FolderPlus}>Add project</Chip> (top-right), type a
                name, press <Kbd>Enter</Kbd> or <Chip>Add</Chip>. With a single
                project it is always named <em>General</em>; add a second one to
                rename them freely.
              </Step>
              <Step n={2}>
                <strong>Add a row.</strong> In the project header, click{" "}
                <Chip icon={Plus}>Media Type</Chip> and pick a type. Each type
                can be added once per project.
              </Step>
              <Step n={3}>
                <strong>Type the amounts.</strong> Click a month cell and type.
                Move on with <Kbd>Tab</Kbd>, <Kbd>Enter</Kbd>, or arrows. Totals
                update live.
              </Step>
            </Steps>
            <Callout tone="tip" icon={Lightbulb} title="Go faster">
              See{" "}
              <GoLink onClick={() => go("spreadsheet")}>Spreadsheet skills</GoLink>{" "}
              for copy/paste &amp; fill, and{" "}
              <GoLink onClick={() => go("spread")}>Distribute an amount</GoLink>{" "}
              to fan one total across months in a click.
            </Callout>
            <Callout tone="info" icon={Trash2} title="Row actions live in the ⋯ menu">
              Hover a row and open its <strong>⋯</strong> menu for{" "}
              <em>Distribute…</em>, <em>Add note</em>, and <em>Remove</em>.
              Removing a row or project becomes permanent once autosave runs —
              press <Chip icon={RotateCcw}>Discard</Chip> right away to restore
              the last saved state.
            </Callout>
            {onJump && (
              <PrimaryAction onClick={() => onJump("media")}>
                Open the Media Spend tab
              </PrimaryAction>
            )}
          </>
        ),
      },
      {
        id: "spreadsheet",
        label: "Spreadsheet skills",
        icon: Keyboard,
        keywords: "excel copy paste fill down right keyboard shortcuts select drag shift arrows tab enter clipboard tsv",
        body: () => (
          <>
            <Lead>
              The grid behaves like Excel. These work on any cell selection:
            </Lead>
            <ul className="space-y-1.5">
              <Bullet>
                <strong>Select</strong> a range: click &amp; drag, or click then{" "}
                <Kbd>Shift</Kbd>+click.
              </Bullet>
              <Bullet>
                <strong>Copy / paste</strong> with <Kbd>Ctrl/⌘</Kbd>+<Kbd>C</Kbd>{" "}
                / <Kbd>V</Kbd> — round-trips with Excel, so paste a block straight
                from a spreadsheet.
              </Bullet>
              <Bullet>
                <strong>Fill</strong> a selection down with <Kbd>Ctrl/⌘</Kbd>+
                <Kbd>D</Kbd> or right with <Kbd>Ctrl/⌘</Kbd>+<Kbd>R</Kbd>.
              </Bullet>
              <Bullet>
                <strong>Copy from read-only cells</strong> (MediaOcean,
                MediaBox, locked months): a single click copies the value.
              </Bullet>
            </ul>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  <ShortcutRow keys={["Click", "+ drag"]} desc="Select a range" />
                  <ShortcutRow keys={["Shift", "Click"]} desc="Extend the selection" />
                  <ShortcutRow keys={["Ctrl/⌘", "C"]} desc="Copy (Excel-compatible)" />
                  <ShortcutRow keys={["Ctrl/⌘", "V"]} desc="Paste into the grid" />
                  <ShortcutRow keys={["Ctrl/⌘", "D"]} desc="Fill down" />
                  <ShortcutRow keys={["Ctrl/⌘", "R"]} desc="Fill right" />
                  <ShortcutRow keys={["↑↓←→"]} desc="Move between cells" />
                  <ShortcutRow keys={["Tab", "Enter"]} desc="Move to the next cell" />
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        id: "spread",
        label: "Distribute an amount",
        icon: SplitSquareHorizontal,
        keywords: "distribute amount spread across months equal weighted line total replace add curve split one total fan",
        body: () => (
          <>
            <Lead>
              To fan a single total across months in one row, open the
              row&apos;s <strong>⋯</strong> menu and pick{" "}
              <Chip icon={SplitSquareHorizontal}>Distribute…</Chip>. The{" "}
              <strong>Distribute amount</strong> dialog opens.
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Amount</strong> — type one total to spread.
              </Step>
              <Step n={2}>
                <strong>Months</strong> — tick which months receive a share (
                <em>All</em> / <em>None</em> helpers; closed months are locked).
              </Step>
              <Step n={3}>
                <strong>Split</strong> — how the total is divided across ticked
                months:
                <Defs>
                  <Def term="Equal parts">every ticked month gets the same.</Def>
                  <Def term="Weighted by existing">
                    shares follow each month&apos;s current value (keeps the
                    existing shape/curve).
                  </Def>
                </Defs>
              </Step>
              <Step n={4}>
                <strong>Existing values</strong> — only if the row already has
                numbers, choose how to apply the result:
                <Defs>
                  <Def term="Line total">unticked months reset to 0.</Def>
                  <Def term="Replace ticked">unticked months kept as-is.</Def>
                  <Def term="Add to ticked">share added on top of existing.</Def>
                </Defs>
              </Step>
            </Steps>
            <Callout tone="info" icon={Info} title="Exact to the cent">
              The split rounds to the cent and absorbs any remainder in the last
              ticked month, so the parts always add back to your total.
            </Callout>
          </>
        ),
      },
      {
        id: "save",
        label: "Autosave, save & discard",
        icon: Save,
        keywords: "save autosave discard unsaved changes counter dirty lock locked read only cannot save revert undo status saving saved",
        body: () => (
          <>
            <Lead>
              You don&apos;t have to press Save: edits{" "}
              <strong>autosave a moment after you pause</strong>, and pending
              changes are also flushed when you switch away or close the tab.
              The toolbar tells you where things stand:
            </Lead>
            <Steps>
              <Step n={1}>
                <em>Unsaved — autosaving…</em> → <em>Saving…</em> →{" "}
                <em>Saved</em>. A whole editing burst lands as one write.
              </Step>
              <Step n={2}>
                <SaveChip /> forces an immediate write (it carries a counter of
                pending changes). Useful right before sharing or locking.
              </Step>
              <Step n={3}>
                <Chip icon={RotateCcw}>Discard</Chip> restores the last saved
                state — it only rolls back what hasn&apos;t autosaved yet, so
                use it quickly after a mistake.
              </Step>
            </Steps>
            <Callout tone="warn" icon={AlertTriangle} title="Everything read-only?">
              If you see{" "}
              <IconText icon={Lock}>RFQ locked — read only</IconText>, an admin
              has locked this RFQ. Ask them to unlock it, or pick an unlocked one.
            </Callout>
          </>
        ),
      },
      {
        id: "notes",
        label: "Notes & readiness",
        icon: StickyNote,
        keywords: "notes column row note submission note comment shared bl forecast validation monthly confirmation ready months readiness flag complete justify",
        body: () => (
          <>
            <Lead>
              Three ways to annotate a submission — all shared with teammates
              who can see the client:
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Row notes</strong> — every row has a cell in the{" "}
                <strong>Notes</strong> column (click it, or use the row&apos;s{" "}
                <strong>⋯</strong> menu → <em>Add note</em>). Toggle the column
                with the <Chip icon={StickyNote}>Notes</Chip> button in the grid
                toolbar; the choice sticks across reloads.
              </Step>
              <Step n={2}>
                <strong>Submission note</strong> — the card above the grid
                (toggled with the <Chip icon={StickyNote}>Notes</Chip> button in
                the top bar) holds one free-text note for the whole{" "}
                Client × Year × RFQ. It shows on all three tabs, autosaves, and
                stays editable even on a locked RFQ.
              </Step>
              <Step n={3}>
                <strong>BL Forecast Validation</strong> — the green button in the
                top bar (left of Flags). Confirm each milestone step (RFQ BL
                deadlines and Mid-Quarter Validations) as it&apos;s complete.
                Purely indicative: it locks nothing, it just signals completion
                to the team. A step can&apos;t be confirmed while the submission
                has unjustified flags — justify them in the Flags drawer first.
              </Step>
            </Steps>
          </>
        ),
      },
    ],
  },
  {
    title: "The other axes",
    chapters: [
      {
        id: "labs",
        label: "Labs basics",
        icon: FlaskConical,
        keywords: "labs partner admin partners empty add rows configure year setup investment",
        body: ({ onJump, go }) => (
          <>
            <Lead>
              The <Chip icon={FlaskConical}>Labs</Chip> tab tracks investment with
              Labs partners against your planned media. It works exactly like
              Media Spend — projects, partner rows, the same BL SUBMISSION /
              REFERENCE DATA sections — with partners instead of media types.
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Partners come from setup.</strong> Rows are the partners
                configured for the year; each carries a media-type chip (and a
                description when two partners share a name). If the list is
                empty, an admin must add them in{" "}
                <Chip icon={null}>Admin → LABS</Chip> first.
              </Step>
              <Step n={2}>
                Add a project and partner rows the same way as Media, then enter
                monthly amounts — or drive it from the Share panel.
              </Step>
            </Steps>
            <Callout tone="tip" icon={Percent} title="Next: the Share panel">
              The fastest way to fill Labs is by coverage % — see{" "}
              <GoLink onClick={() => go("labs-share")}>Labs share &amp; coverage</GoLink>.
            </Callout>
            {onJump && (
              <PrimaryAction onClick={() => onJump("labs")}>
                Open the Labs tab
              </PrimaryAction>
            )}
          </>
        ),
      },
      {
        id: "labs-share",
        label: "Labs share & coverage",
        icon: Percent,
        keywords: "share penetration coverage percent percentage target ratio labs media over 100 split across projects pencil",
        body: () => (
          <>
            <Lead>
              On the Labs tab, the <Chip icon={Percent}>Share</Chip> toggle in
              the top bar shows/hides the penetration panel on the right (open
              by default). It lists each media type that has a Labs partner
              configured, how much your partners cover of its planned media, and
              the global <IconText icon={Target}>Labs / Media</IconText> ratio
              against its target.
            </Lead>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Pencil size={15} className="text-gray-400" />
              Set a partner&apos;s coverage %
            </h4>
            <Steps>
              <Step n={1}>
                Click the{" "}
                <Pencil size={12} className="inline align-middle text-gray-500" />{" "}
                pencil next to a partner and enter a %.
              </Step>
              <Step n={2}>
                The tool fills that partner&apos;s forecast to that share of the
                planned media, <strong>month by month, following the media curve</strong>.
              </Step>
            </Steps>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <SplitSquareHorizontal size={15} className="text-gray-400" />
              When a partner spans several projects
            </h4>
            <p>
              You&apos;ll get a <strong>Split across projects</strong> dialog to
              choose how the target spend is divided:
            </p>
            <Defs>
              <Def term="Per-project %">
                a percentage box per project; the header tracks the running{" "}
                <em>x% / 100%</em> and must total 100% to apply.
              </Def>
              <Def term="Default split">
                proportional to each project&apos;s current Labs spend (even split
                if none yet).
              </Def>
              <Def term="Even split">
                one click to spread the target equally.
              </Def>
            </Defs>
            <Callout tone="warn" icon={AlertTriangle} title="Over 100%">
              A red{" "}
              <IconText icon={AlertTriangle} className="text-red-500">
                Over 100%
              </IconText>{" "}
              flag means a media type&apos;s partners together exceed its planned
              budget — dial one back.
            </Callout>
          </>
        ),
      },
      {
        id: "revenue",
        label: "Revenue",
        icon: DollarSign,
        keywords: "revenue retainer commission overwrite project fees product fees accrual calculated rates zero gaia official bl submission source of truth variance mauve violet emerald green struck",
        body: ({ onJump }) => (
          <>
            <Lead>
              The <Chip icon={DollarSign}>Revenue</Chip> tab holds{" "}
              <strong>projects</strong>, like Media and Labs: each project
              carries its revenue lines (<strong>Retainer</strong>,{" "}
              <strong>Commission Overwrite</strong>,{" "}
              <strong>Project Fees</strong>, <strong>Product Fees</strong> —
              added per project via <Chip icon={Plus}>Add line</Chip>). The{" "}
              <strong>General</strong> project is fixed (it can&apos;t be
              renamed or removed): it hosts the computed{" "}
              <strong>Commission</strong> line and the <strong>Accrual</strong>{" "}
              line.
            </Lead>
            <Callout tone="tip" icon={Sparkles} title="Commission is calculated">
              The{" "}
              <span className="inline-flex items-center gap-1 align-middle rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                <Sparkles size={10} /> Calculated
              </span>{" "}
              row is derived from your <strong>Media Spend</strong> × the
              client&apos;s commission rates and re-syncs whenever Media saves.
              You can&apos;t type into it — hover a month for the
              per-media-type breakdown. All zeros with a <em>no rates</em> note?
              Set rates on the client (Clients page → commissions), then return.
              To replace the calculation for a month, enter the amount on a{" "}
              <strong>Commission Overwrite</strong> line: the commission is not
              calculated for any month where an overwrite value exists — a
              deliberately entered 0 counts (it zeroes the commission). The{" "}
              <strong>Accrual</strong> line is for revenue (e.g. commission)
              GAIA missed in closed months.
            </Callout>
            <Lead>
              Below your input, the <strong>GAIA</strong> section (admin-only)
              carries the booked figures per type, each expandable into detail
              lines. Then come the summary rows:
            </Lead>
            <Steps>
              <Step n={1}>
                <strong className="text-violet-700">BL Submission · current
                submission</strong> (mauve) — the month-by-month source of
                truth: where a GAIA detail line has a value, it wins; otherwise
                your BL Input counts. Counted cells are highlighted mauve,
                overridden ones struck through (see the legend above the table).
              </Step>
              <Step n={2}>
                <strong>Official Revenue · previous RFQ</strong> and{" "}
                <strong>Variance</strong> — the previous submission&apos;s
                official figure and how your current BL Submission moves against
                it, per month.
              </Step>
              <Step n={3}>
                <strong className="text-emerald-700">Official Revenue ·
                current submission</strong> (green, bottom row) — the
                hand-entered official total, admin-editable like the other GAIA
                rows. It <em>is</em> the official number; nothing rolls into it.
              </Step>
            </Steps>
            {onJump && (
              <PrimaryAction onClick={() => onJump("revenue")}>
                Open the Revenue tab
              </PrimaryAction>
            )}
          </>
        ),
      },
    ],
  },
  {
    title: "Compare & reallocate",
    chapters: [
      {
        id: "compare",
        label: "Compare submissions",
        icon: GitCompareArrows,
        keywords: "compare comparison reference rfq actuals mediaocean variance bars donut list view difference versus delta default previous panel",
        body: () => (
          <>
            <Lead>
              On Media Spend and Labs, the <strong>Comparison</strong> panel
              sits to the right of the grid (toggle it with the{" "}
              <Chip icon={GitCompareArrows}>Compare</Chip> button in the top
              bar). By default it compares against the{" "}
              <strong>previous submission</strong> — no setup needed.
            </Lead>
            <Steps>
              <Step n={1}>
                To compare against something else, use the selectors inside the
                panel: a <strong>year</strong>, a <strong>submission</strong>,
                and the side — <Chip>BL Input</Chip> (a forecast) or{" "}
                <em>MediaOcean (annual)</em>. The{" "}
                <Chip icon={RotateCcw}>Default</Chip> button returns to the
                previous-submission comparison in one click.
              </Step>
              <Step n={2}>
                Toggle the three views — <strong>list</strong>,{" "}
                <strong>variance bars</strong>, or a <strong>double donut</strong>{" "}
                — and read the green/red variance pills per type. In the list
                view, the <ChevronRight size={12} className="inline align-middle" />{" "}
                chevron expands a type into its 12-month detail.
              </Step>
            </Steps>
            <Note>
              The left side is always your live edits, so the gap updates as you
              type. Amounts are aggregated per type (projects excluded). The
              Revenue tab has no side panel — its comparison is built into the
              grid (<em>Official Revenue · previous RFQ</em> and the{" "}
              <em>Variance</em> row).
            </Note>
          </>
        ),
      },
      {
        id: "reallocate",
        label: "Reallocate budget",
        icon: SplitSquareHorizontal,
        keywords: "reallocate budget distribute difference gap close single split percent destination new row months equal weighted push align",
        body: () => (
          <>
            <Lead>
              From the comparison panel&apos;s <strong>list</strong> view you can
              push a gap straight into your projects. Click a type row to target
              the whole-year gap, or expand it with the{" "}
              <ChevronRight size={12} className="inline align-middle" /> chevron
              and click a single month. The <strong>Distribute difference</strong>{" "}
              dialog opens.
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Amount to distribute</strong> — pre-filled with the gap to
                close (<em>reference − current</em>); editable. It is always{" "}
                <strong>added on top</strong> of what projects already hold.
              </Step>
              <Step n={2}>
                <strong>Months</strong> — tick which months receive it (
                <em>All</em> / <em>None</em>; closed months locked).
              </Step>
              <Step n={3}>
                <strong>Spread across months</strong>:
                <Defs>
                  <Def term="Equal parts">same amount per ticked month.</Def>
                  <Def term="Weighted by existing">
                    follows each project&apos;s current month profile.
                  </Def>
                </Defs>
              </Step>
              <Step n={4}>
                <strong>Destination project</strong>:
                <Defs>
                  <Def term="Single">
                    <IconText icon={Target}>100% to one project</IconText> you
                    pick.
                  </Def>
                  <Def term="Split %">
                    a percentage per project (must total 100%; <em>Even split</em>{" "}
                    helper). Projects without this type yet show{" "}
                    <Chip icon={null}>new row</Chip> — the row is created on apply.
                  </Def>
                </Defs>
              </Step>
              <Step n={5}>
                Press <Chip>Distribute</Chip>. The numbers land in the grid like
                any other edit — review them, and they autosave.
              </Step>
            </Steps>
            <Callout tone="tip" icon={Lightbulb} title="Typical use">
              Align this round to a prior RFQ: compare against it, click the type
              with the biggest variance, accept the suggested gap, split it across
              the right projects, and save.
            </Callout>
          </>
        ),
      },
    ],
  },
  {
    title: "Reference",
    chapters: [
      {
        id: "export",
        label: "Export to CSV",
        icon: Download,
        keywords: "export csv download file spreadsheet share archive",
        body: () => (
          <>
            <Lead>
              On any tab, click <Chip icon={Download}>CSV</Chip> to download the
              current view — the client, year, and RFQ are baked into the file
              name — for sharing or archiving.
            </Lead>
          </>
        ),
      },
      {
        id: "faq",
        label: "Troubleshooting",
        icon: HelpCircle,
        keywords: "troubleshooting problem read only cannot type zero empty missing disappeared not saving error help why can't locked",
        body: () => (
          <>
            <Faq q="The grid is read-only / I can't type.">
              One of: the RFQ is <strong>locked</strong> (red lock), the month is
              a <strong>closed period</strong> (lock in its header), the client
              isn&apos;t assigned to you, or you&apos;re in the{" "}
              <strong>REFERENCE DATA</strong> section (MediaOcean is admin-only,
              MediaBox is synced and never editable).
            </Faq>
            <Faq q="Did my changes save?">
              Edits autosave shortly after you pause; check the toolbar for the{" "}
              <em>Saved</em> check. If it shows <em>Save failed</em>, edit any
              cell to retry or press <SaveChip />.
            </Faq>
            <Faq q="I deleted a row by mistake.">
              Press <strong>Discard</strong> right away — it restores the last
              saved state. If autosave already ran, re-add the row (its type
              picker keeps the same options).
            </Faq>
            <Faq q="The Revenue Commission row is all zeros.">
              No commission rates for this client &amp; year. Set them on the{" "}
              <strong>Clients</strong> page (commissions), then come back — the
              row recalculates from Media Spend.
            </Faq>
            <Faq q="The Labs partner list is empty.">
              No partner is configured for the year. An admin adds them in{" "}
              <strong>Admin → LABS</strong>.
            </Faq>
            <Faq q="A row is flagged “Not configured”.">
              Its type (e.g. a Labs partner) was removed from the year&apos;s
              setup. The data is kept, but the type can&apos;t be re-added.
            </Faq>
            <Faq q="I can't find a client in the dropdown.">
              You only see clients assigned to you (and hidden clients are
              filtered out). Ask an admin to assign it or unhide it.
            </Faq>
          </>
        ),
      },
    ],
  },
];

// Flat order for Prev/Next paging.
const FLAT: Chapter[] = GROUPS.flatMap((g) => g.chapters);

const CHAPTER_BY_ID: Record<string, Chapter> = Object.fromEntries(
  FLAT.map((c) => [c.id, c])
);
const GROUP_OF: Record<string, string> = {};
for (const g of GROUPS) for (const c of g.chapters) GROUP_OF[c.id] = g.title;

// ─── Quick-find topics — granular entries that deep-link to a chapter ─────────
// These let someone search for a specific thing ("copy from Excel", "commission
// is zero") and jump straight to the chapter that covers it.
interface Topic {
  label: string;
  chapterId: string;
  keywords?: string;
}

const TOPICS: Topic[] = [
  { label: "Copy & paste from Excel", chapterId: "spreadsheet", keywords: "clipboard tsv block" },
  { label: "Fill down / fill right", chapterId: "spreadsheet", keywords: "ctrl d r repeat" },
  { label: "Keyboard shortcuts", chapterId: "spreadsheet", keywords: "keys hotkeys arrows tab" },
  { label: "Copy a read-only cell", chapterId: "spreadsheet", keywords: "mediaocean mediabox click clipboard" },
  { label: "Distribute one amount across months", chapterId: "spread", keywords: "spread tool fan curve" },
  { label: "Equal vs weighted split", chapterId: "spread", keywords: "mode shape" },
  { label: "Line total / replace / add", chapterId: "spread", keywords: "behaviour existing values" },
  { label: "Add a project", chapterId: "media", keywords: "bucket new campaign general" },
  { label: "Add a media type row", chapterId: "media", keywords: "row line type" },
  { label: "Remove a row or project", chapterId: "media", keywords: "delete trash undo" },
  { label: "Lock / closed period / read-only", chapterId: "grid", keywords: "frozen cannot edit" },
  { label: "BL Submission vs Reference Data", chapterId: "grid", keywords: "sections black row total" },
  { label: "MediaOcean & MediaBox", chapterId: "grid", keywords: "booked admin actuals reference synced campaigns" },
  { label: "Autosave status (Saving… / Saved)", chapterId: "save", keywords: "indicator pending flush" },
  { label: "Save or discard changes", chapterId: "save", keywords: "unsaved revert force" },
  { label: "Row notes & the Notes column", chapterId: "notes", keywords: "comment annotate cell" },
  { label: "Submission note (shared)", chapterId: "notes", keywords: "card team comment locked" },
  { label: "BL Forecast Validation", chapterId: "notes", keywords: "readiness complete confirm tick flags justify monthly milestone rfq mid-quarter" },
  { label: "Commission is zero / set rates", chapterId: "revenue", keywords: "no rates rate calculated" },
  { label: "Why commission can't be edited", chapterId: "revenue", keywords: "calculated derived media" },
  { label: "Accrual line (revenue missed by GAIA)", chapterId: "revenue", keywords: "closed months commission catch up" },
  { label: "BL Submission (mauve) source of truth", chapterId: "revenue", keywords: "violet purple struck overridden counted" },
  { label: "Official Revenue (green row)", chapterId: "revenue", keywords: "emerald gaiaForecast official total bottom" },
  { label: "Labs partner list is empty", chapterId: "labs", keywords: "admin configure year" },
  { label: "Set a partner's coverage %", chapterId: "labs-share", keywords: "pencil penetration percent" },
  { label: "Labs / Media target ratio", chapterId: "labs-share", keywords: "share goal 25" },
  { label: "Split coverage across projects", chapterId: "labs-share", keywords: "even split percent" },
  { label: "Over 100% warning", chapterId: "labs-share", keywords: "exceeds budget cap" },
  { label: "Compare with another RFQ", chapterId: "compare", keywords: "reference round versus year submission" },
  { label: "Default comparison (previous submission)", chapterId: "compare", keywords: "reset auto" },
  { label: "Compare against MediaOcean", chapterId: "compare", keywords: "booked actuals annual side" },
  { label: "Variance bars / donut views", chapterId: "compare", keywords: "chart pills" },
  { label: "Reallocate budget / distribute the difference", chapterId: "reallocate", keywords: "gap close push align" },
  { label: "Single vs Split % destination", chapterId: "reallocate", keywords: "project percent one many" },
  { label: "Export to CSV", chapterId: "export", keywords: "download file" },
  { label: "Can't edit / grid is read-only", chapterId: "faq", keywords: "locked closed not assigned" },
  { label: "Did my changes save?", chapterId: "faq", keywords: "disappeared lost autosave failed" },
];

// ─── Flat, searchable index of chapters + topics ─────────────────────────────
interface SearchHit {
  chapterId: string;
  title: string;
  /** Group title (for a chapter) or the owning chapter (for a topic). */
  context: string;
  icon: typeof BookOpen;
  isTopic: boolean;
  hay: string;
}

const INDEX: SearchHit[] = [
  ...FLAT.map((c) => ({
    chapterId: c.id,
    title: c.label,
    context: GROUP_OF[c.id],
    icon: c.icon,
    isTopic: false,
    hay: `${c.label} ${c.keywords ?? ""} ${GROUP_OF[c.id]}`.toLowerCase(),
  })),
  ...TOPICS.map((t) => ({
    chapterId: t.chapterId,
    title: t.label,
    context: CHAPTER_BY_ID[t.chapterId].label,
    icon: CornerDownRight,
    isTopic: true,
    hay: `${t.label} ${t.keywords ?? ""} ${CHAPTER_BY_ID[t.chapterId].label}`.toLowerCase(),
  })),
];

/** Tokenized AND search over the index. */
function searchIndex(query: string): SearchHit[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return INDEX.filter((hit) => tokens.every((t) => hit.hay.includes(t))).slice(
    0,
    14
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function HowToGuide({ onJump }: HowToGuideProps) {
  const [activeId, setActiveId] = useState(FLAT[0].id);
  const [query, setQuery] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  const index = Math.max(0, FLAT.findIndex((c) => c.id === activeId));
  const chapter = FLAT[index];
  const next = index < FLAT.length - 1 ? FLAT[index + 1] : null;

  const hits = searchIndex(query);
  const go = (id: string) => setActiveId(id);
  // Picking from search navigates and clears the query so the menu resets.
  const pick = (id: string) => {
    setActiveId(id);
    setQuery("");
  };

  // On chapter change, bring the reader back to the top of the content.
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeId]);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_256px] lg:gap-8">
      {/* ─── Content (left column) ─── */}
      <div className="min-w-0 max-w-3xl">
        <div ref={topRef} className="scroll-mt-36" />

        {/* Mobile chapter picker — search, then results or a compact select */}
        <div className="mb-4 space-y-2 lg:hidden">
          <SearchBox value={query} onChange={setQuery} />
          {query ? (
            <SearchResults hits={hits} onPick={pick} />
          ) : (
            <select
              value={activeId}
              onChange={(e) => go(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              {GROUPS.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {/* Chapter header */}
        <div className="mb-5 border-b border-gray-200 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Chapter {index + 1} of {FLAT.length}
          </p>
          <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold text-gray-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-yellow-400">
              <chapter.icon size={18} />
            </span>
            {chapter.label}
          </h1>
        </div>

        {/* Chapter body */}
        <div className="space-y-4 text-sm leading-relaxed text-gray-700">
          {chapter.body({ onJump, go })}
        </div>

        {/* End CTA — only on the last chapter */}
        {!next && onJump && (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-yellow-400 bg-yellow-400 px-6 py-7 text-center">
            <CheckCircle2 className="text-gray-900" size={26} />
            <p className="text-sm font-medium text-gray-800">
              That&apos;s the whole flow. Ready to forecast?
            </p>
            <button
              type="button"
              onClick={() => onJump("media")}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Start with Media Spend
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>

      {/* ─── Quick navigation panel (right column, desktop) ─── */}
      <aside className="hidden lg:block">
        <div className="sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-2.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <ListChecks size={13} />
            Quick navigation
          </div>
          <SearchBox value={query} onChange={setQuery} />
          <div className="mt-3">
            {query ? (
              <SearchResults hits={hits} onPick={pick} />
            ) : (
              <GroupedNav activeId={activeId} onPick={go} />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Quick-find navigation ───────────────────────────────────────────────────

/** Search input with a clear button. */
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search the guide…"
        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Flat list of search hits (chapters + topics) that deep-link on click. */
function SearchResults({
  hits,
  onPick,
}: {
  hits: SearchHit[];
  onPick: (chapterId: string) => void;
}) {
  if (hits.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
        No match. Try another word.
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {hits.map((hit, i) => {
        const Icon = hit.icon;
        return (
          <li key={`${hit.chapterId}-${i}`}>
            <button
              type="button"
              onClick={() => onPick(hit.chapterId)}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-gray-100"
            >
              <Icon size={15} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-gray-900">
                  {hit.title}
                </span>
                <span className="block truncate text-[11px] text-gray-400">
                  {hit.isTopic ? "in " : ""}
                  {hit.context}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The grouped chapter menu (shown when the search box is empty). */
function GroupedNav({
  activeId,
  onPick,
}: {
  activeId: string;
  onPick: (chapterId: string) => void;
}) {
  return (
    <nav className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.chapters.map((c) => {
              const Icon = c.icon;
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-yellow-400 text-gray-900"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon
                      size={15}
                      className={active ? "text-gray-900" : "text-gray-400"}
                    />
                    <span className="truncate">{c.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ─── Building blocks ─────────────────────────────────────────────────────────

/** Intro paragraph of a chapter. */
function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-gray-700">{children}</p>;
}

/** Plain secondary note. */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

/** Ordered list of workflow steps with numbered badges. */
function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-2.5">{children}</ol>;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center bg-gray-900 text-[11px] font-bold text-white">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Bulleted point with a chevron marker. */
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <ChevronRight size={15} className="mt-0.5 flex-shrink-0 text-yellow-500" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Definition list — term + explanation, for option breakdowns. */
function Defs({ children }: { children: React.ReactNode }) {
  return <dl className="mt-1.5 space-y-1.5 pl-1">{children}</dl>;
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="flex-shrink-0">
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[12px] font-semibold text-gray-800">
          {term}
        </span>
      </dt>
      <dd className="min-w-0 text-[13px] text-gray-600">{children}</dd>
    </div>
  );
}

/** Inline chip that mimics a UI control, optionally with a leading icon. */
function Chip({
  children,
  icon: Icon = ArrowRight,
}: {
  children: React.ReactNode;
  /** Leading icon, or `null` for a plain label chip. */
  icon?: typeof ArrowRight | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 align-middle text-[12px] font-medium text-gray-700">
      {Icon ? <Icon size={11} className="text-gray-400" /> : null}
      {children}
    </span>
  );
}

/** The yellow Save button, inline. */
function SaveChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-yellow-400 px-1.5 py-0.5 align-middle text-[12px] font-semibold text-gray-900">
      <Save size={11} />
      Save
    </span>
  );
}

/** Inline icon + text run (e.g. a state label with its icon). */
function IconText({
  icon: Icon,
  className = "text-gray-500",
  children,
}: {
  icon: typeof Info;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 align-middle font-medium">
      <Icon size={12} className={className} />
      {children}
    </span>
  );
}

/** Keyboard key cap. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block rounded border border-gray-300 bg-white px-1.5 py-0.5 align-middle font-mono text-[11px] font-semibold text-gray-700">
      {children}
    </kbd>
  );
}

/** Inline link that navigates to another chapter. */
function GoLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-semibold text-gray-900 underline decoration-yellow-400 decoration-2 underline-offset-2 hover:text-gray-700"
    >
      {children}
    </button>
  );
}

/** Solid call-to-action button (jumps to a tab). */
function PrimaryAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
    >
      {children}
      <ArrowRight size={15} />
    </button>
  );
}

/** Highlighted callout box, tone-colored. */
function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "info" | "tip" | "warn";
  icon: typeof Info;
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      box: "border-blue-300 bg-blue-200",
      icon: "text-gray-900",
      title: "text-gray-900",
      body: "text-gray-800",
    },
    tip: {
      box: "border-green-500 bg-green-500",
      icon: "text-white",
      title: "text-white",
      body: "text-white",
    },
    warn: {
      box: "border-yellow-400 bg-yellow-400",
      icon: "text-gray-900",
      title: "text-gray-900",
      body: "text-gray-800",
    },
  }[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${styles.box}`}>
      <Icon size={17} className={`mt-0.5 flex-shrink-0 ${styles.icon}`} />
      <div className={`min-w-0 text-sm leading-relaxed ${styles.body}`}>
        <p className={`mb-0.5 font-semibold ${styles.title}`}>{title}</p>
        {children}
      </div>
    </div>
  );
}

/** Clickable axis overview card (jumps to that tab when wired). */
function AxisCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof TrendingUp;
  title: string;
  desc: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left ${
        onClick ? "transition-colors hover:border-yellow-400 hover:bg-gray-100" : ""
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Icon size={16} className="text-yellow-500" />
        {title}
      </span>
      <span className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{desc}</span>
    </Tag>
  );
}

/** A single keyboard-shortcut table row. */
function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <tr>
      <td className="w-44 whitespace-nowrap px-4 py-2.5">
        <span className="inline-flex items-center gap-1">
          {keys.map((k, i) => (
            <Kbd key={i}>{k}</Kbd>
          ))}
        </span>
      </td>
      <td className="px-4 py-2.5 text-gray-600">{desc}</td>
    </tr>
  );
}

/** One question/answer block. */
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="flex items-start gap-2 text-sm font-semibold text-gray-900">
        <HelpCircle size={15} className="mt-0.5 flex-shrink-0 text-gray-400" />
        {q}
      </p>
      <div className="mt-1.5 pl-7 text-sm leading-relaxed text-gray-600">
        {children}
      </div>
    </div>
  );
}
