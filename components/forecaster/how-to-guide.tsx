// components/forecaster/how-to-guide.tsx
"use client";

/**
 * How-to guide — the content of the "How to" tab on the forecast page.
 *
 * A chaptered, step-by-step manual aimed at someone who has never used the
 * platform. Instead of one long page, it splits into short focused chapters with
 * a grouped left-rail menu (a select on small screens) and Prev/Next paging, so
 * it stays light to navigate. The content mirrors the real workflow and uses the
 * same visual language as the app (yellow accent, inline UI chips, lucide icons)
 * so the instructions match what the reader sees on screen.
 *
 * Purely presentational: no data, no Firebase. The only outward interaction is
 * the optional `onJump` callback, wired to the page's tab switcher so the guide
 * can send the reader straight to the relevant axis tab.
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
                desc="Planned spend per media type, month by month. The backbone — Revenue commission is derived from it."
                onClick={onJump ? () => onJump("media") : undefined}
              />
              <AxisCard
                icon={DollarSign}
                title="Revenue"
                desc="Agency revenue streams. Commission is auto-calculated from Media Spend."
                onClick={onJump ? () => onJump("revenue") : undefined}
              />
              <AxisCard
                icon={FlaskConical}
                title="Labs"
                desc="Investment with Labs partners, tracked against planned media."
                onClick={onJump ? () => onJump("labs") : undefined}
              />
            </div>
            <Callout tone="info" icon={Save} title="Nothing autosaves">
              Your edits stay on screen (highlighted) until you press{" "}
              <SaveChip />. Switching tabs keeps unsaved edits; leaving the page
              or pressing <Chip icon={RotateCcw}>Discard</Chip> drops them.
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
              Use the three selectors at the top of the page. Until all three are
              set, the grid stays empty and shows a checklist of what&apos;s
              missing.
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
              The Client / Year / RFQ applies to Media, Revenue, and Labs at once.
              Switch tabs freely — you stay on the same submission.
            </Callout>
          </>
        ),
      },
      {
        id: "grid",
        label: "Read the grid",
        icon: ListChecks,
        keywords: "project bucket row total months columns actuals mediaocean gaia closed period lock read only anatomy table layout",
        body: () => (
          <>
            <Lead>
              Every axis shows the same kind of table: rows on the left, the 12
              months (Jan → Dec) across the top, and a <strong>Total</strong>{" "}
              column on the right. It&apos;s three levels deep:
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Project</strong> (a bucket) — a named group, e.g. a
                campaign. Its header row shows the project subtotal.
              </Step>
              <Step n={2}>
                <strong>Rows</strong> — one typed line inside a project (a media
                type, revenue stream, or Labs partner), each with 12 monthly
                amounts.
              </Step>
              <Step n={3}>
                <strong>Total</strong> — the dark row sums every project, per
                month and for the year.
              </Step>
              <Step n={4}>
                <strong>Actuals</strong> (<em>MediaOcean</em> for Media,{" "}
                <em>GAIA</em> for Revenue) — booked numbers, <strong>admin-only
                </strong>, used as a comparison reference.
              </Step>
            </Steps>
            <Callout tone="info" icon={Lock} title="Closed periods">
              A month with a <Lock size={12} className="inline align-middle" />{" "}
              lock in its header is a closed period — those cells are frozen for
              Business Leads so past months can&apos;t change.
            </Callout>
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
                name, press <Kbd>Enter</Kbd> or <Chip>Add</Chip>.
              </Step>
              <Step n={2}>
                <strong>Add a row.</strong> In the project header, click{" "}
                <Chip icon={Plus}>Media type</Chip> and pick a type. Each type
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
              <GoLink onClick={() => go("spread")}>The Spread tool</GoLink> to
              fan one total across months in a click.
            </Callout>
            <Callout tone="info" icon={Trash2} title="Removing is safe">
              The <Trash2 size={12} className="inline align-middle" /> icons
              remove a row or whole project on your screen only — nothing is gone
              until you Save, and <Chip icon={RotateCcw}>Discard</Chip> brings it
              all back.
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
        label: "The Spread tool",
        icon: SplitSquareHorizontal,
        keywords: "distribute amount spread across months equal weighted line total replace add curve split one total fan",
        body: () => (
          <>
            <Lead>
              To fan a single total across months in one row, hover the row and
              click the{" "}
              <SplitSquareHorizontal
                size={13}
                className="inline align-middle text-gray-500"
              />{" "}
              spread icon. The <strong>Distribute amount</strong> dialog opens.
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
        label: "Save & discard",
        icon: Save,
        keywords: "save discard unsaved changes counter dirty lock locked read only cannot save revert undo",
        body: () => (
          <>
            <Lead>
              Edits are local until you save. The <SaveChip /> button carries a
              counter of unsaved changes.
            </Lead>
            <Steps>
              <Step n={1}>
                Press <SaveChip /> to write the whole tab at once. It stays
                disabled when there&apos;s nothing to save.
              </Step>
              <Step n={2}>
                <Chip icon={RotateCcw}>Discard</Chip> restores the last saved
                state.
              </Step>
            </Steps>
            <Callout tone="warn" icon={AlertTriangle} title="Save greyed out?">
              If you see{" "}
              <IconText icon={Lock}>RFQ locked — read only</IconText>, an admin
              has locked this RFQ. Ask them to unlock it, or pick an unlocked one.
            </Callout>
          </>
        ),
      },
    ],
  },
  {
    title: "The other axes",
    chapters: [
      {
        id: "revenue",
        label: "Revenue",
        icon: DollarSign,
        keywords: "revenue retainer commission project fees product fees calculated rates zero gaia streams breakdown hover",
        body: ({ onJump }) => (
          <>
            <Lead>
              The <Chip icon={DollarSign}>Revenue</Chip> tab has a fixed set of
              rows — no projects to add. You fill in <strong>Retainer</strong>,{" "}
              <strong>Project Fees</strong>, <strong>Product Fees</strong>, plus a
              special <strong>Commission</strong> row.
            </Lead>
            <Callout tone="tip" icon={Sparkles} title="Commission is calculated">
              The{" "}
              <span className="inline-flex items-center gap-1 align-middle rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-600">
                <Sparkles size={10} /> Calculated
              </span>{" "}
              row is derived from your <strong>Media Spend</strong> × the
              client&apos;s commission rates. You can&apos;t type into it — hover
              a month to see the per-media-type breakdown.
            </Callout>
            <Steps>
              <Step n={1}>
                Enter the fee rows like Media (cells, paste, spread tool).
              </Step>
              <Step n={2}>
                If Commission is all zeros with a <strong>no rates</strong> note,
                set rates in <Chip icon={null}>Clients → commissions</Chip> for
                this client &amp; year, then return.
              </Step>
            </Steps>
            <Note>
              The <strong>GAIA</strong> section below holds booked actuals and is
              admin-only.
            </Note>
            {onJump && (
              <PrimaryAction onClick={() => onJump("revenue")}>
                Open the Revenue tab
              </PrimaryAction>
            )}
          </>
        ),
      },
      {
        id: "labs",
        label: "Labs basics",
        icon: FlaskConical,
        keywords: "labs partner admin partners empty add rows configure year setup investment",
        body: ({ onJump, go }) => (
          <>
            <Lead>
              The <Chip icon={FlaskConical}>Labs</Chip> tab tracks investment with
              Labs partners against your planned media.
            </Lead>
            <Steps>
              <Step n={1}>
                <strong>Partners come from setup.</strong> Rows are the partners
                configured for the year. If the list is empty, an admin must add
                them in <Chip icon={null}>Admin → Labs</Chip> first.
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
              On the Labs tab, the <Chip icon={Percent}>Share</Chip> button opens
              the penetration panel on the right. It shows, per media type, how
              much your partners cover of the planned media, and the global{" "}
              <IconText icon={Target}>Labs / Media</IconText> ratio against its
              target.
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
    ],
  },
  {
    title: "Compare & reallocate",
    chapters: [
      {
        id: "compare",
        label: "Compare submissions",
        icon: GitCompareArrows,
        keywords: "compare comparison reference rfq actuals mediaocean gaia variance bars donut list view difference versus delta",
        body: () => (
          <>
            <Lead>
              To see how this forecast moved versus a previous round (or the
              actuals), use the <strong>Comparison</strong> group at the top of
              the page.
            </Lead>
            <Steps>
              <Step n={1}>
                Open <Chip icon={GitCompareArrows}>Compare with…</Chip> and pick a
                reference RFQ.
              </Step>
              <Step n={2}>
                Pick the side: <Chip>BL Input</Chip> (a forecast) or the actuals (
                <em>MediaOcean</em> / <em>GAIA</em>).
              </Step>
              <Step n={3}>
                A panel opens beside the grid. Toggle its three views —{" "}
                <strong>list</strong>, <strong>variance bars</strong>, or a{" "}
                <strong>double donut</strong> — and read the green/red variance
                pills per type.
              </Step>
            </Steps>
            <Note>
              The left side is always your live edits, so the gap updates as you
              type. Aggregated to the annual total per type (projects excluded).
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
                Press <Chip>Distribute</Chip>. The numbers land in the grid as
                unsaved edits — review, then <SaveChip />.
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
              <strong>Actuals</strong> section (admin-only).
            </Faq>
            <Faq q="My numbers disappeared / didn't save.">
              Changes are local until you press <SaveChip />. Switching RFQ or
              leaving the page without saving drops them.
            </Faq>
            <Faq q="The Revenue Commission row is all zeros.">
              No commission rates for this client &amp; year. Set them in{" "}
              <strong>Clients → commissions</strong>, then return.
            </Faq>
            <Faq q="The Labs partner list is empty.">
              No partner is configured for the year. An admin adds them in{" "}
              <strong>Admin → Labs</strong>.
            </Faq>
            <Faq q="I can't find a client in the dropdown.">
              You only see clients assigned to you. Ask an admin to assign it.
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
  { label: "Distribute one amount across months", chapterId: "spread", keywords: "spread tool fan curve" },
  { label: "Equal vs weighted split", chapterId: "spread", keywords: "mode shape" },
  { label: "Line total / replace / add", chapterId: "spread", keywords: "behaviour existing values" },
  { label: "Add a project", chapterId: "media", keywords: "bucket new campaign" },
  { label: "Add a media type row", chapterId: "media", keywords: "row line type" },
  { label: "Lock / closed period / read-only", chapterId: "grid", keywords: "frozen cannot edit" },
  { label: "Actuals (MediaOcean / GAIA)", chapterId: "grid", keywords: "booked admin reference" },
  { label: "Commission is zero / set rates", chapterId: "revenue", keywords: "no rates rate calculated" },
  { label: "Why commission can't be edited", chapterId: "revenue", keywords: "calculated derived media" },
  { label: "Labs partner list is empty", chapterId: "labs", keywords: "admin configure year" },
  { label: "Set a partner's coverage %", chapterId: "labs-share", keywords: "pencil penetration percent" },
  { label: "Labs / Media target ratio", chapterId: "labs-share", keywords: "share goal 25" },
  { label: "Split coverage across projects", chapterId: "labs-share", keywords: "even split percent" },
  { label: "Over 100% warning", chapterId: "labs-share", keywords: "exceeds budget cap" },
  { label: "Compare with another RFQ", chapterId: "compare", keywords: "reference round versus" },
  { label: "Compare against actuals", chapterId: "compare", keywords: "mediaocean gaia booked" },
  { label: "Variance bars / donut views", chapterId: "compare", keywords: "chart pills" },
  { label: "Reallocate budget / distribute the difference", chapterId: "reallocate", keywords: "gap close push align" },
  { label: "Single vs Split % destination", chapterId: "reallocate", keywords: "project percent one many" },
  { label: "Export to CSV", chapterId: "export", keywords: "download file" },
  { label: "Save or discard changes", chapterId: "save", keywords: "unsaved revert" },
  { label: "Can't edit / grid is read-only", chapterId: "faq", keywords: "locked closed not assigned" },
  { label: "My numbers didn't save", chapterId: "faq", keywords: "disappeared lost" },
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
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-6 py-7 text-center">
            <CheckCircle2 className="text-yellow-500" size={26} />
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
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white">
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
    <kbd className="inline-block rounded border border-gray-300 bg-white px-1.5 py-0.5 align-middle font-mono text-[11px] font-semibold text-gray-700 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
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
    info: { box: "border-blue-200 bg-blue-50", icon: "text-blue-500", title: "text-blue-900" },
    tip: { box: "border-emerald-200 bg-emerald-50", icon: "text-emerald-500", title: "text-emerald-900" },
    warn: { box: "border-amber-200 bg-amber-50", icon: "text-amber-500", title: "text-amber-900" },
  }[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${styles.box}`}>
      <Icon size={17} className={`mt-0.5 flex-shrink-0 ${styles.icon}`} />
      <div className="min-w-0 text-sm leading-relaxed text-gray-700">
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
        onClick ? "transition-colors hover:border-yellow-300 hover:bg-yellow-50/40" : ""
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
