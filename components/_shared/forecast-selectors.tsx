// components/_shared/forecast-selectors.tsx
"use client";

/**
 * Sélecteurs globaux de la sidebar (sous le logo) :
 *  — Client  : dropdown avec recherche (admin = tous, BL = assignés)
 *  — Année   : dropdown des années existantes dans la collection rfqs
 *  — RFQ     : dropdown des RFQs de l'année, avec icône lock/unlock
 *
 * La sélection est écrite dans le store Zustand useForecastSelection,
 * partagé entre toutes les pages.
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

export default function ForecastSelectors() {
  const { profile, isAdmin } = useUserProfile();

  const {
    selectedClient,
    selectedYear,
    selectedRFQ,
    setClient,
    setYear,
    setRFQ,
  } = useForecastSelection();

  // ─── Data ───────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [rfqs, setRFQs] = useState<RFQ[]>([]);

  // Fetch clients (scoped by role)
  useEffect(() => {
    if (!profile) return;

    async function fetchClients() {
      try {
        let snapshot;
        if (isAdmin) {
          snapshot = await getDocs(collection(db, "clients"));
        } else {
          const assigned = profile?.assignedClients ?? [];
          if (assigned.length === 0) {
            setClients([]);
            return;
          }
          snapshot = await getDocs(
            query(collection(db, "clients"), where("__name__", "in", assigned))
          );
        }
        const data: ClientSummary[] = snapshot.docs
          .map((d) => {
            const c = d.data();
            return {
              cl_id: d.id,
              CL_Name: c.CL_Name ?? d.id,
              CL_Logo: c.CL_Logo,
              CL_Agency: c.CL_Agency ?? "",
              CL_Business_Lead: c.CL_Business_Lead ?? "",
              Client_Status_2026: c.Client_Status_2026,
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
  }, [profile, isAdmin]);

  // Subscribe to RFQs (real-time lock status)
  useEffect(() => {
    const unsubscribe = subscribeToRFQs(setRFQs);
    return () => unsubscribe();
  }, []);

  // Keep the selected RFQ object fresh (status may change in real-time)
  useEffect(() => {
    if (!selectedRFQ) return;
    const fresh = rfqs.find((r) => r.rfq_id === selectedRFQ.rfq_id);
    if (!fresh) {
      setRFQ(null); // RFQ deleted
    } else if (fresh.status !== selectedRFQ.status) {
      setRFQ(fresh); // status updated
    }
  }, [rfqs, selectedRFQ, setRFQ]);

  const years = useMemo(() => getRFQYears(rfqs), [rfqs]);
  const rfqsForYear = useMemo(
    () => (selectedYear ? getRFQsForYear(rfqs, selectedYear) : []),
    [rfqs, selectedYear]
  );

  return (
    <div className="px-3 py-4 border-b border-gray-800 space-y-2">

      {/* Client — searchable */}
      <SearchableDropdown
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

      {/* Year */}
      <SimpleDropdown
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

      {/* RFQ — with lock icon */}
      <SimpleDropdown
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
    </div>
  );
}

// ─── Shared dropdown primitives (dark sidebar styling) ────────────────────────

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
}: {
  icon: React.ReactNode;
  value: string | null;
  placeholder: string;
  open: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border
        ${open ? "bg-gray-800 border-gray-600" : "bg-gray-800/60 border-gray-700 hover:bg-gray-800"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      <span
        className={`flex-1 text-left truncate ${
          value ? "text-white font-medium" : "text-gray-500"
        }`}
      >
        {value ?? placeholder}
      </span>
      <ChevronDown
        size={13}
        className={`text-gray-500 flex-shrink-0 transition-transform ${
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
  children,
}: {
  items: DropdownItem[];
  emptyMessage: string;
  onClose: () => void;
  children?: React.ReactNode; // optional search input slot
}) {
  return (
    <div className="absolute left-0 right-0 mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
      {children}
      <ul className="max-h-56 overflow-y-auto py-1">
        {items.length === 0 ? (
          <li className="px-3 py-3 text-xs text-gray-500 text-center">
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
                  item.selected
                    ? "bg-gray-700 text-white"
                    : "text-gray-300 hover:bg-gray-700/60 hover:text-white"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-gray-500 truncate">
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
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string | null;
  items: DropdownItem[];
  emptyMessage: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <TriggerButton
        icon={icon}
        value={value}
        placeholder={placeholder}
        open={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <DropdownPanel
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
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string | null;
  items: DropdownItem[];
  emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useClickOutside(() => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="relative" ref={ref}>
      <TriggerButton
        icon={icon}
        value={value}
        placeholder={placeholder}
        open={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <DropdownPanel
          items={filtered}
          emptyMessage={emptyMessage}
          onClose={() => setOpen(false)}
        >
          <div className="relative border-b border-gray-700">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}