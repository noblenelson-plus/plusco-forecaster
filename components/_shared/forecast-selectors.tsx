// components/_shared/forecast-selectors.tsx
"use client";

/**
 * Global selectors — Client / Year / RFQ.
 *
 *  — Client : searchable dropdown (admin = all clients, BL = assigned ones)
 *  — Year   : dropdown of the years present in the rfqs collection
 *  — RFQ    : dropdown of the year's RFQs, with a lock/unlock icon
 *
 * The selection is written to the Zustand store useForecastSelection,
 * shared across every page. Pass `override` to bind the Year/RFQ pair to a
 * different store instead (used by the dashboard's comparison scope) — the
 * Client selector always uses the primary store since comparison shares the
 * dashboard's filtered client scope.
 *
 * The component is themeable / orientable so it can live either in the dark
 * sidebar (vertical) or at the top of the forecast page (horizontal, light).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  ChevronDown,
  Search,
  Briefcase,
  CalendarRange,
  Lock,
  Unlock,
  Check,
} from "lucide-react";
import { db } from "../../lib/firebase";
import { useUserProfile } from "../../lib/hooks/use-user-profile";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import {
  subscribeToRFQs,
  getRFQYears,
  getRFQsForYear,
} from "../../lib/services/rfq-service";
import type { RFQ } from "../../lib/types/rfq.types";
import type { ClientSummary } from "../../lib/types/client.types";
import { isClientHidden } from "../../lib/format/client";

// Firestore limits "in" queries to 30 values — split into batches.
const IN_QUERY_LIMIT = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

type Theme = "dark" | "light";
type Orientation = "vertical" | "horizontal";
type SelectorField = "client" | "year" | "rfq";

const ALL_FIELDS: SelectorField[] = ["client", "year", "rfq"];

/**
 * Optional binding override for the Year + RFQ pair. When provided, those two
 * dropdowns read and write through this object instead of useForecastSelection.
 * Used by the dashboard to render a second "comparison" pair backed by
 * useComparisonSelection. The Client selector is unaffected.
 */
export interface ForecastSelectorsOverride {
  year: number | null;
  rfq: RFQ | null;
  setYear: (year: number | null) => void;
  setRFQ: (rfq: RFQ | null) => void;
}

interface ForecastSelectorsProps {
  /** "vertical" → sidebar stack · "horizontal" → top-of-page row. */
  orientation?: Orientation;
  /** "dark" → sidebar styling · "light" → on-page styling. */
  theme?: Theme;
  /**
   * Which selectors to render, in order. Defaults to all three. The dashboard
   * uses ["year", "rfq"] — its client scope is a separate multi-select filter.
   */
  fields?: SelectorField[];
  /**
   * Optional Year/RFQ binding. Omit to use the primary forecast store
   * (default behavior, unchanged for every existing call site). Provide it
   * to bind the Year + RFQ pair to a different source — e.g. the dashboard
   * comparison store.
   */
  override?: ForecastSelectorsOverride;
}

export default function ForecastSelectors({
  orientation = "vertical",
  theme = "dark",
  fields = ALL_FIELDS,
  override,
}: ForecastSelectorsProps = {}) {
  const { profile, isAdmin } = useUserProfile();

  const {
    selectedClient,
    selectedYear: primaryYear,
    selectedRFQ: primaryRFQ,
    setClient,
    setYear: setPrimaryYear,
    setRFQ: setPrimaryRFQ,
  } = useForecastSelection();

  // Year/RFQ bindings resolve to the override when provided, primary store
  // otherwise. The Client selector always uses the primary store regardless.
  const selectedYear = override ? override.year : primaryYear;
  const selectedRFQ = override ? override.rfq : primaryRFQ;
  const setYear = override ? override.setYear : setPrimaryYear;
  const setRFQ = override ? override.setRFQ : setPrimaryRFQ;

  // ─── Data ───────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [rfqs, setRFQs] = useState<RFQ[]>([]);

  const showClient = fields.includes("client");
  const showYear = fields.includes("year");
  const showRFQ = fields.includes("rfq");

  // Fetch clients (scoped by role) — skipped when the client selector is hidden.
  useEffect(() => {
    if (!profile || !showClient) return;

    async function fetchClients() {
      try {
        let docs;
        if (isAdmin) {
          docs = (await getDocs(collection(db, "clients"))).docs;
        } else {
          const assigned = profile?.assignedClients ?? [];
          if (assigned.length === 0) {
            setClients([]);
            return;
          }
          // Firestore caps "in" queries at 30 values; batch when a BL has more.
          const snapshots = await Promise.all(
            chunk(assigned, IN_QUERY_LIMIT).map((ids) =>
              getDocs(
                query(collection(db, "clients"), where("__name__", "in", ids))
              )
            )
          );
          docs = snapshots.flatMap((s) => s.docs);
        }
        const data: ClientSummary[] = docs
          // Hidden clients are not selectable for forecasting.
          .filter((d) => !isClientHidden(d.data()))
          .map((d) => {
            const c = d.data();
            return {
              cl_id: d.id,
              CL_Name: c.CL_Name ?? d.id,
              CL_Logo: c.CL_Logo,
              CL_Agency: c.CL_Agency ?? "",
              CL_Business_Lead: c.CL_Business_Lead ?? "",
              Client_Status_By_Year: c.Client_Status_By_Year ?? {},
              CL_Currency: c.CL_Currency ?? "CAD",
            };
          })
          .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));
        setClients(data);
      } catch (err) {
        console.error("Failed to load clients for selector:", err);
      }
    }

    fetchClients();
  }, [profile, isAdmin, showClient]);

  // Subscribe to RFQs (real-time lock status)
  useEffect(() => {
    const unsubscribe = subscribeToRFQs(setRFQs);
    return () => unsubscribe();
  }, []);

  // Keep the selected RFQ object fresh (status or closed months may change in
  // real-time when an admin edits the RFQ). Follows whichever binding is
  // active, so both primary and comparison pairs stay current.
  useEffect(() => {
    if (!selectedRFQ) return;
    const fresh = rfqs.find((r) => r.rfq_id === selectedRFQ.rfq_id);
    if (!fresh) {
      setRFQ(null); // RFQ deleted
    } else if (
      fresh.status !== selectedRFQ.status ||
      JSON.stringify(fresh.closedMonths ?? null) !==
        JSON.stringify(selectedRFQ.closedMonths ?? null)
    ) {
      setRFQ(fresh); // status or closed months updated
    }
  }, [rfqs, selectedRFQ, setRFQ]);

  const years = useMemo(() => getRFQYears(rfqs), [rfqs]);
  const rfqsForYear = useMemo(
    () => (selectedYear ? getRFQsForYear(rfqs, selectedYear) : []),
    [rfqs, selectedYear]
  );

  const horizontal = orientation === "horizontal";
  const containerClass = horizontal
    ? "flex flex-wrap items-center gap-2"
    : "px-3 py-4 border-b border-gray-800 space-y-2";

  return (
    <div className={containerClass}>

      {/* Client — searchable */}
      {showClient && (
        <SearchableDropdown
          theme={theme}
          widthClass={horizontal ? "w-56" : ""}
          icon={<Briefcase size={14} />}
          placeholder="Select client..."
          value={selectedClient?.CL_Name ?? null}
          items={clients.map((c) => ({
            key: c.cl_id,
            label: c.CL_Name,
            sublabel: c.CL_Agency,
            selected: selectedClient?.cl_id === c.cl_id,
            onSelect: () => setClient(c),
          }))}
          emptyMessage="No clients found"
        />
      )}

      {/* Year */}
      {showYear && (
        <SimpleDropdown
          theme={theme}
          widthClass={horizontal ? "w-32" : ""}
          icon={<CalendarRange size={14} />}
          placeholder="Year..."
          value={selectedYear ? String(selectedYear) : null}
          items={years.map((y) => ({
            key: String(y),
            label: String(y),
            selected: selectedYear === y,
            onSelect: () => setYear(y),
          }))}
          emptyMessage="No RFQs created yet"
        />
      )}

      {/* RFQ — with lock icon */}
      {showRFQ && (
      <SimpleDropdown
        theme={theme}
        widthClass={horizontal ? "w-40" : ""}
        icon={
          selectedRFQ ? (
            selectedRFQ.status === "LOCKED" ? (
              <Lock size={14} className="text-red-400" />
            ) : (
              <Unlock size={14} className="text-emerald-400" />
            )
          ) : (
            <Unlock size={14} />
          )
        }
        placeholder="RFQ..."
        value={selectedRFQ?.type ?? null}
        disabled={!selectedYear}
        items={rfqsForYear.map((r) => ({
          key: r.rfq_id,
          label: r.type,
          selected: selectedRFQ?.rfq_id === r.rfq_id,
          trailing:
            r.status === "LOCKED" ? (
              <Lock size={12} className="text-red-400" />
            ) : (
              <Unlock size={12} className="text-emerald-400" />
            ),
          onSelect: () => setRFQ(r),
        }))}
        emptyMessage={selectedYear ? "No RFQs for this year" : "Select a year first"}
      />
      )}
    </div>
  );
}

// ─── Theme tokens ─────────────────────────────────────────────────────────────

const TRIGGER_STYLES: Record<
  Theme,
  { open: string; closed: string; icon: string; value: string; placeholder: string; chevron: string }
> = {
  dark: {
    open: "bg-gray-800 border-gray-600",
    closed: "bg-gray-800/60 border-gray-700 hover:bg-gray-800",
    icon: "text-gray-400",
    value: "text-white font-medium",
    placeholder: "text-gray-500",
    chevron: "text-gray-500",
  },
  light: {
    open: "bg-white border-gray-300 ring-2 ring-yellow-400",
    closed: "bg-white border-gray-200 hover:bg-gray-50",
    icon: "text-gray-400",
    value: "text-gray-900 font-medium",
    placeholder: "text-gray-400",
    chevron: "text-gray-400",
  },
};

const PANEL_STYLES: Record<
  Theme,
  { panel: string; empty: string; itemBase: string; itemSelected: string; sublabel: string; searchBorder: string; searchInput: string; searchIcon: string }
> = {
  dark: {
    panel: "bg-gray-800 border-gray-700",
    empty: "text-gray-500",
    itemBase: "text-gray-300 hover:bg-gray-700/60 hover:text-white",
    itemSelected: "bg-gray-700 text-white",
    sublabel: "text-gray-500",
    searchBorder: "border-gray-700",
    searchInput: "text-white placeholder-gray-500",
    searchIcon: "text-gray-500",
  },
  light: {
    panel: "bg-white border-gray-200",
    empty: "text-gray-400",
    itemBase: "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
    itemSelected: "bg-gray-100 text-gray-900",
    sublabel: "text-gray-400",
    searchBorder: "border-gray-200",
    searchInput: "text-gray-900 placeholder-gray-400",
    searchIcon: "text-gray-400",
  },
};

// ─── Shared dropdown primitives ───────────────────────────────────────────────

interface DropdownItem {
  key: string;
  label: string;
  sublabel?: string;
  trailing?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

function TriggerButton({
  icon,
  value,
  placeholder,
  open,
  disabled,
  onClick,
  theme,
}: {
  icon: React.ReactNode;
  value: string | null;
  placeholder: string;
  open: boolean;
  disabled?: boolean;
  onClick: () => void;
  theme: Theme;
}) {
  const t = TRIGGER_STYLES[theme];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border
        ${open ? t.open : t.closed}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <span className={`${t.icon} flex-shrink-0`}>{icon}</span>
      <span
        className={`flex-1 text-left truncate ${value ? t.value : t.placeholder}`}
      >
        {value ?? placeholder}
      </span>
      <ChevronDown
        size={13}
        className={`${t.chevron} flex-shrink-0 transition-transform ${
          open ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

function DropdownPanel({
  items,
  emptyMessage,
  onClose,
  theme,
  children,
}: {
  items: DropdownItem[];
  emptyMessage: string;
  onClose: () => void;
  theme: Theme;
  children?: React.ReactNode; // optional search input slot
}) {
  const t = PANEL_STYLES[theme];
  return (
    <div
      className={`absolute left-0 right-0 mt-1 z-50 border rounded-lg shadow-xl overflow-hidden ${t.panel}`}
    >
      {children}
      <ul className="max-h-56 overflow-y-auto py-1">
        {items.length === 0 ? (
          <li className={`px-3 py-3 text-xs text-center ${t.empty}`}>
            {emptyMessage}
          </li>
        ) : (
          items.map((item) => (
            <li key={item.key}>
              <button
                onClick={() => {
                  item.onSelect();
                  onClose();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  item.selected ? t.itemSelected : t.itemBase
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className={`text-xs truncate ${t.sublabel}`}>
                      {item.sublabel}
                    </p>
                  )}
                </div>
                {item.trailing}
                {item.selected && (
                  <Check size={13} className="text-yellow-400 flex-shrink-0" />
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function SimpleDropdown({
  icon,
  placeholder,
  value,
  items,
  emptyMessage,
  disabled,
  theme,
  widthClass = "",
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string | null;
  items: DropdownItem[];
  emptyMessage: string;
  disabled?: boolean;
  theme: Theme;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div className={`relative ${widthClass}`} ref={ref}>
      <TriggerButton
        theme={theme}
        icon={icon}
        value={value}
        placeholder={placeholder}
        open={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <DropdownPanel
          theme={theme}
          items={items}
          emptyMessage={emptyMessage}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function SearchableDropdown({
  icon,
  placeholder,
  value,
  items,
  emptyMessage,
  theme,
  widthClass = "",
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string | null;
  items: DropdownItem[];
  emptyMessage: string;
  theme: Theme;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useClickOutside(() => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);
  const t = PANEL_STYLES[theme];

  // Focus search input when opening
  useEffect(() => {
    if (open) {
      setSearch("");
      // slight delay so the panel is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = items.filter(
    (i) =>
      i.label.toLowerCase().includes(search.toLowerCase()) ||
      (i.sublabel ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`relative ${widthClass}`} ref={ref}>
      <TriggerButton
        theme={theme}
        icon={icon}
        value={value}
        placeholder={placeholder}
        open={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <DropdownPanel
          theme={theme}
          items={filtered}
          emptyMessage={emptyMessage}
          onClose={() => setOpen(false)}
        >
          <div className={`relative border-b ${t.searchBorder}`}>
            <Search
              size={13}
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.searchIcon}`}
            />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className={`w-full pl-8 pr-3 py-2 text-sm bg-transparent focus:outline-none ${t.searchInput}`}
            />
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}