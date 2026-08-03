// components/forecaster/sections/client-table-columns.ts

/**
 * Column descriptors for the client detail table.
 *
 * Media and Labs metrics live in ONE merged list rather than two exclusive
 * sets. The Media / Labs toggle now only picks which columns are checked by
 * default (see `clientTablePresets`), so a Labs metric can be switched on while
 * the table sits in Media view — the point of Adriana's column picker.
 *
 * This is free at the data layer: ClientTableRow already carries both the media
 * and the labs figures for every client, so nothing extra is fetched.
 *
 * Variance columns render "—" and sort as empty until a comparison submission
 * is selected; that state is closed over by the builder so the descriptor
 * functions stay unary.
 */

import type {
  ColumnPreset,
  TableColumn,
} from "../table/table-column.types";
import {
  CHANNEL_ORDER,
  PARTNER_COLS,
  type ClientTableRow,
} from "./client-table-data";
import { ratio, type ClientTableTotals } from "./client-table-totals";
import { formatMoney } from "../../../lib/format/money";

export type ClientColumn = TableColumn<ClientTableRow, ClientTableTotals>;

/** Picker section names. Also drive the Media / Labs presets. */
export const GROUP_DIMENSION = "Client";
export const GROUP_MEDIA = "Media";
export const GROUP_CHANNELS = "Media channels";
export const GROUP_LABS = "Labs";
export const GROUP_PARTNERS = "Labs partners";

const MEDIA_GROUPS = [GROUP_MEDIA, GROUP_CHANNELS];
const LABS_GROUPS = [GROUP_LABS, GROUP_PARTNERS];

/** formatMoney already returns "—" for zero; prefix the rest with a dollar sign. */
const money = (value: number): string => {
  const formatted = formatMoney(value);
  return formatted === "—" ? formatted : `$${formatted}`;
};

const percent = (value: number | null): string =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;

/** Slug for a label used as part of a stable column id. */
const slug = (label: string): string =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const channelValue = (row: ClientTableRow, label: string): number =>
  row.channels.find((c) => c.label === label)?.value ?? 0;

const partnerCell = (row: ClientTableRow, label: string) =>
  row.partners.find((p) => p.label === label);

export function buildClientTableColumns({
  hasComparison,
}: {
  hasComparison: boolean;
}): ClientColumn[] {
  // ── Column factories ──────────────────────────────────────────────────────

  const dimension = (
    id: string,
    label: string,
    width: number,
    get: (row: ClientTableRow) => string
  ): ClientColumn => ({
    id,
    label,
    group: GROUP_DIMENSION,
    kind: "text",
    align: "left",
    pinned: true,
    width,
    raw: get,
    display: (row) => get(row) || "—",
  });

  const moneyColumn = (
    id: string,
    label: string,
    group: string,
    get: (row: ClientTableRow) => number,
    getTotal: (totals: ClientTableTotals) => number
  ): ClientColumn => ({
    id,
    label,
    group,
    kind: "money",
    align: "right",
    raw: get,
    display: (row) => money(get(row)),
    total: (totals) => money(getTotal(totals)),
    totalRaw: getTotal,
  });

  /** Money column that stays blank until a comparison submission is chosen. */
  const varianceColumn = (
    id: string,
    label: string,
    group: string,
    get: (row: ClientTableRow) => number,
    getTotal: (totals: ClientTableTotals) => number
  ): ClientColumn => ({
    id,
    label,
    group,
    kind: "money",
    align: "right",
    raw: (row) => (hasComparison ? get(row) : null),
    display: (row) => (hasComparison ? money(get(row)) : "—"),
    total: (totals) => (hasComparison ? money(getTotal(totals)) : "—"),
    totalRaw: (totals) => (hasComparison ? getTotal(totals) : null),
  });

  const percentColumn = (
    id: string,
    label: string,
    group: string,
    get: (row: ClientTableRow) => number | null,
    getTotal: (totals: ClientTableTotals) => number | null,
    kind: "percent" | "share" = "percent"
  ): ClientColumn => ({
    id,
    label,
    group,
    kind,
    align: "right",
    raw: get,
    display: (row) => percent(get(row)),
    total: (totals) => percent(getTotal(totals)),
    totalRaw: getTotal,
  });

  // ── Frozen dimension columns ──────────────────────────────────────────────

  const dimensions: ClientColumn[] = [
    dimension("client", "Client", 180, (r) => r.name),
    dimension("tier", "Tier", 70, (r) => r.tier),
    dimension("business-lead", "Business Lead", 200, (r) => r.businessLead),
    dimension("agency", "Agency", 120, (r) => r.agency),
    dimension("bu-region", "BU Region", 90, (r) => r.region),
    dimension("status", "Status", 100, (r) => r.status),
  ];

  // ── Media ─────────────────────────────────────────────────────────────────

  const media: ClientColumn[] = [
    moneyColumn("total-media", "Total Media", GROUP_MEDIA,
      (r) => r.totalMedia, (t) => t.totalMedia),
    varianceColumn("total-media-var", "Total Media Var $", GROUP_MEDIA,
      (r) => r.totalMediaVar, (t) => t.totalMediaVar),
    moneyColumn("total-digital-media", "Total Digital Media", GROUP_MEDIA,
      (r) => r.digitalMedia, (t) => t.digitalMedia),
    varianceColumn("total-digital-media-var", "Total Digital Media Var $", GROUP_MEDIA,
      (r) => r.digitalMediaVar, (t) => t.digitalMediaVar),
    moneyColumn("total-traditional-media", "Total Traditional Media", GROUP_MEDIA,
      (r) => r.traditionalMedia, (t) => t.traditionalMedia),
    varianceColumn("total-traditional-media-var", "Total Traditional Media Var $", GROUP_MEDIA,
      (r) => r.traditionalMediaVar, (t) => t.traditionalMediaVar),
    // The only banded column: "share" carries the conditional colouring.
    percentColumn("digital-share", "Digital Share", GROUP_MEDIA,
      (r) => r.digitalShare, (t) => ratio(t.digitalMedia, t.totalMedia), "share"),
  ];

  const channels: ClientColumn[] = CHANNEL_ORDER.map((label) =>
    moneyColumn(`channel-${slug(label)}`, label, GROUP_CHANNELS,
      (r) => channelValue(r, label), (t) => t.channels[label] ?? 0)
  );

  // ── Labs ──────────────────────────────────────────────────────────────────

  const labs: ClientColumn[] = [
    moneyColumn("total-labs", "TOTAL-LABS", GROUP_LABS,
      (r) => r.totalLabs, (t) => t.totalLabs),
    varianceColumn("labs-var", "LABS Var $", GROUP_LABS,
      (r) => r.labsVar, (t) => t.labsVar),
    percentColumn("labs-share-total-media", "LABS Share of Total Media", GROUP_LABS,
      (r) => r.labsShareTotalMedia, (t) => ratio(t.totalLabs, t.totalMedia)),
    percentColumn("billups-share-print", "Billups Share of Print", GROUP_LABS,
      (r) => r.billupsShareOfPrint, (t) => ratio(t.billupsPrint, t.printMedia)),
    percentColumn("billups-share-ooh", "Billups Share of OOH", GROUP_LABS,
      (r) => r.billupsShareOfOoh, (t) => ratio(t.billupsOoh, t.oohMedia)),
  ];

  const partners: ClientColumn[] = PARTNER_COLS.flatMap((partner) => [
    moneyColumn(`partner-${partner.key}`, partner.label, GROUP_PARTNERS,
      (r) => partnerCell(r, partner.label)?.primary ?? 0,
      (t) => t.partners[partner.label]?.primary ?? 0),
    varianceColumn(`partner-${partner.key}-var`, `${partner.label} Var $`, GROUP_PARTNERS,
      (r) => partnerCell(r, partner.label)?.variance ?? 0,
      (t) => t.partners[partner.label]?.variance ?? 0),
  ]);

  return [...dimensions, ...media, ...channels, ...labs, ...partners];
}

/**
 * The Media / Labs toggle as two default selections over the merged list.
 * Membership is derived from the column groups, so a column added above joins
 * the right preset automatically.
 */
export function clientTablePresets(columns: ClientColumn[]): ColumnPreset[] {
  const idsForGroups = (groups: string[]) =>
    columns.filter((c) => groups.includes(c.group)).map((c) => c.id);

  return [
    { id: "media", label: "Media", visibleIds: idsForGroups(MEDIA_GROUPS) },
    { id: "labs", label: "Labs", visibleIds: idsForGroups(LABS_GROUPS) },
  ];
}