// components/clients/client-filters.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, Upload, Download, Percent, RefreshCw, ChevronDown, Users, Copy } from "lucide-react";
import { Client } from "../../lib/types/client.types";
import {
  ClientStatus,
  CLIENT_AGENCIES,
  CLIENT_TIERS,
  CLIENT_REGIONS,
  CLIENT_ADVERTISER_VERTICALS,
} from "../../lib/constants/client.constants";
import {
  exportClientsToCSV,
  exportCommissionsToCSV,
  validateCSV,
  CSVValidationResult,
} from "../../lib/services/client-service";
import ImportModal from "./import-modal";
import RecomputeTiersModal from "./recompute-tiers-modal";
import CopyCommissionsModal from "./copy-commissions-modal";
import MultiSelectDropdown from "../_shared/multi-select-dropdown";

type StatusFilter = "ALL" | ClientStatus;

interface ClientFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  /* Multi-select facets — an empty array means "no filter" (all pass). */
  agencyFilter: string[];
  onAgencyFilterChange: (value: string[]) => void;
  tierFilter: string[];
  onTierFilterChange: (value: string[]) => void;
  regionFilter: string[];
  onRegionFilterChange: (value: string[]) => void;
  verticalFilter: string[];
  onVerticalFilterChange: (value: string[]) => void;
  clients: Client[];
  filteredClients: Client[];
  isAdmin: boolean;
  onAddClient: () => void;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL",        label: "All" },
  { value: "ACTIVE",     label: "Active" },
  { value: "INACTIVE",   label: "Inactive" },
  { value: "LOSS",       label: "Loss" },
  { value: "NEW_CLIENT", label: "New" },
];

const AGENCY_OPTIONS = CLIENT_AGENCIES.map((a) => ({ value: a.value, label: a.label }));
const TIER_OPTIONS   = CLIENT_TIERS.map((t) => ({ value: t.value, label: t.label }));
const REGION_OPTIONS = CLIENT_REGIONS.map((r) => ({ value: r.value, label: r.label }));

// "" matches clients whose vertical is unset (older docs) — the page resolves
// a missing CL_Advertiser_Vertical to "" before comparing.
const VERTICAL_OPTIONS = [
  ...CLIENT_ADVERTISER_VERTICALS.map((v) => ({ value: v.value, label: v.label })),
  { value: "", label: "(Not set)" },
];

export default function ClientFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  agencyFilter,
  onAgencyFilterChange,
  tierFilter,
  onTierFilterChange,
  regionFilter,
  onRegionFilterChange,
  verticalFilter,
  onVerticalFilterChange,
  clients,
  filteredClients,
  isAdmin,
  onAddClient,
}: ClientFiltersProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<CSVValidationResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importError, setImportError] = useState("");
  const [tiersModalOpen, setTiersModalOpen] = useState(false);
  const [copyRatesModalOpen, setCopyRatesModalOpen] = useState(false);

  // Export dropdown (client list / commission rates) — closes on outside click.
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    function onDown(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidating(true);
    setImportError("");

    try {
      const result = await validateCSV(file);
      setValidation(result);
      setModalOpen(true);
    } catch (err) {
      setImportError(
        "Import failed: " + (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setValidating(false);
      e.target.value = "";
    }
  }

  function handleImported() {
    setModalOpen(false);
    setValidation(null);
    window.location.reload();
  }

  function handleModalClose() {
    setModalOpen(false);
    setValidation(null);
  }

  return (
    <>
      {/* Row 1 — search + status filter + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">

        {/* Left — search + status filter */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">

          {/* Search */}
          <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
          </div>

          {/* Status filter tabs */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onStatusFilterChange(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === opt.value
                    ? "bg-white text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Count */}
          <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:block">
            {filteredClients.length} client{filteredClients.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Right — admin actions */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Export dropdown — client list or commission rates */}
            <div ref={exportRef} className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white transition-colors ${
                  exportOpen
                    ? "text-gray-900 bg-gray-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Download size={14} />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown
                  size={13}
                  className={`transition-transform ${exportOpen ? "rotate-180" : ""}`}
                />
              </button>

              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-xl z-20">
                  <button
                    onClick={() => {
                      exportClientsToCSV(clients);
                      setExportOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Users size={14} className="flex-shrink-0 text-gray-400" />
                    <span>
                      Client list
                      <span className="block text-xs text-gray-400">
                        All client info as CSV
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      exportCommissionsToCSV(clients);
                      setExportOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Percent size={14} className="flex-shrink-0 text-gray-400" />
                    <span>
                      Commission rates
                      <span className="block text-xs text-gray-400">
                        One row per client × year × media type
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Copy commission rates year → year */}
            <button
              onClick={() => setCopyRatesModalOpen(true)}
              title="Copy every client's commission rates from one year to another"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">Rates</span>
            </button>

            {/* Recompute tiers */}
            <button
              onClick={() => setTiersModalOpen(true)}
              title="Recompute every client's tier from the digital spend of a reference RFQ"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Tiers</span>
            </button>

            {/* Import */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={validating}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
            >
              <Upload size={14} className={validating ? "animate-pulse" : ""} />
              <span className="hidden sm:inline">
                {validating ? "Validating..." : "Import"}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportChange}
              className="hidden"
            />

            {/* Add client */}
            <button
              onClick={onAddClient}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
            >
              <Plus size={14} />
              <span>Add client</span>
            </button>

          </div>
        )}
      </div>

      {/* Row 2 — facet dropdowns (same component as the dashboard filters) */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <MultiSelectDropdown
          label="Agency"
          options={AGENCY_OPTIONS}
          selectedValues={agencyFilter}
          onChange={onAgencyFilterChange}
        />
        <MultiSelectDropdown
          label="Tier"
          options={TIER_OPTIONS}
          selectedValues={tierFilter}
          onChange={onTierFilterChange}
        />
        <MultiSelectDropdown
          label="Region"
          options={REGION_OPTIONS}
          selectedValues={regionFilter}
          onChange={onRegionFilterChange}
        />
        <MultiSelectDropdown
          label="Vertical"
          options={VERTICAL_OPTIONS}
          selectedValues={verticalFilter}
          onChange={onVerticalFilterChange}
          searchable
        />

        {(agencyFilter.length > 0 ||
          tierFilter.length > 0 ||
          regionFilter.length > 0 ||
          verticalFilter.length > 0) && (
          <button
            onClick={() => {
              onAgencyFilterChange([]);
              onTierFilterChange([]);
              onRegionFilterChange([]);
              onVerticalFilterChange([]);
            }}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-1.5 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Import error (fatal — before modal) */}
      {importError && (
        <div className="bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg mb-4 text-sm">
          {importError}
        </div>
      )}

      {/* Import confirmation modal */}
      <ImportModal
        open={modalOpen}
        validation={validation}
        onClose={handleModalClose}
        onImported={handleImported}
      />

      {/* Tier recompute modal — reload after apply so the grid shows the new
          tiers (same refresh strategy as the CSV import). */}
      <RecomputeTiersModal
        open={tiersModalOpen}
        clients={clients}
        onClose={() => setTiersModalOpen(false)}
        onApplied={() => window.location.reload()}
      />

      {/* Commission rates year → year copy — same refresh strategy. */}
      <CopyCommissionsModal
        open={copyRatesModalOpen}
        clients={clients}
        onClose={() => setCopyRatesModalOpen(false)}
        onApplied={() => window.location.reload()}
      />
    </>
  );
}