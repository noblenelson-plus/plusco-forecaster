// components/clients/client-filters.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, Upload, Download, Percent, RefreshCw, ChevronDown, Users, Copy, UserCheck, FileSpreadsheet, ExternalLink, Loader2, X } from "lucide-react";
import { Client } from "../../lib/types/client.types";
import {
  ClientStatus,
  CLIENT_AGENCIES,
  CLIENT_TIERS,
  CLIENT_REGIONS,
  CLIENT_ADVERTISER_VERTICALS,
} from "../../lib/constants/client.constants";
import {
  buildClientTable,
  buildCommissionTable,
  clientColumnAllowedValues,
  exportClientsToCSV,
  exportCommissionsToCSV,
  validateCSV,
  CSVValidationResult,
  ImportStructureError,
} from "../../lib/services/client-service";
import { exportToNewSheet, type CellValue } from "../forecaster/table/table-export";
import { isClientHidden } from "../../lib/format/client";
import ImportModal from "./import-modal";
import SheetImportModal from "./sheet-import-modal";
import RecomputeTiersModal from "./recompute-tiers-modal";
import TeamAccessModal from "./team-access-modal";
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
  businessLeadFilter: string[];
  onBusinessLeadFilterChange: (value: string[]) => void;
  /** BL options resolved to names (uid -> label), built on the page. */
  businessLeadOptions: { value: string; label: string }[];
  clients: Client[];
  filteredClients: Client[];
  isAdmin: boolean;
  /** Export is for Business Leads, Execs and Admins; import stays admin-only. */
  canExport: boolean;
  onAddClient: () => void;
}

type ExportKind = "clients" | "commissions";

/**
 * Sheets parses USER_ENTERED values, which would mangle client fields: an
 * 8-hex cl_id like "3e123456" becomes a number in scientific notation and
 * GAIA ids lose leading zeros. A leading apostrophe stores them as plain
 * text (the apostrophe isn't part of the value). CL_Hidden stays unquoted so
 * it lands as a TRUE/FALSE boolean matching its dropdown.
 */
function asSheetText(table: string[][]): CellValue[][] {
  const hiddenCol = table[0]?.indexOf("CL_Hidden") ?? -1;
  return table.map((row, r) =>
    r === 0 ? row : row.map((v, c) => (v && c !== hiddenCol ? `'${v}` : v))
  );
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL",        label: "All" },
  { value: "ACTIVE",     label: "Active" },
  { value: "INACTIVE",   label: "Inactive" },
  { value: "LOSS",       label: "Loss" },
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
  businessLeadFilter,
  onBusinessLeadFilterChange,
  businessLeadOptions,
  clients,
  filteredClients,
  isAdmin,
  canExport,
  onAddClient,
}: ClientFiltersProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<CSVValidationResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importError, setImportError] = useState("");
  const [tiersModalOpen, setTiersModalOpen] = useState(false);
  const [teamAccessModalOpen, setTeamAccessModalOpen] = useState(false);
  const [copyRatesModalOpen, setCopyRatesModalOpen] = useState(false);
  const [sheetImportOpen, setSheetImportOpen] = useState(false);

  // Google Sheets export: which one is running, then the new sheet's link.
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportedSheet, setExportedSheet] = useState<{ label: string; url: string } | null>(null);
  const [exportError, setExportError] = useState("");

  // Hidden clients are admin-only, everywhere — exports included.
  const exportableClients = isAdmin ? clients : clients.filter((c) => !isClientHidden(c));
  const existingIds = new Set(clients.map((c) => c.cl_id));

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

  async function handleSheetExport(kind: ExportKind) {
    setExportOpen(false);
    setExporting(kind);
    setExportError("");
    setExportedSheet(null);
    const date = new Date().toISOString().slice(0, 10);
    try {
      // Connects to Google first (consent popup) when there's no live token.
      const url =
        kind === "clients"
          ? await exportToNewSheet({
              title: `Clients — ${date}`,
              sheetTitle: "Clients",
              matrix: asSheetText(buildClientTable(exportableClients)),
              dropdowns: clientColumnAllowedValues(),
            })
          : await exportToNewSheet({
              title: `Commission rates — ${date}`,
              sheetTitle: "Commission rates",
              matrix: buildCommissionTable(exportableClients),
            });
      const label = kind === "clients" ? "Client list" : "Commission rates";
      setExportedSheet({ label, url });
    } catch (err) {
      setExportError(
        "Google Sheets export failed: " + (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setExporting(null);
    }
  }

  function handleSheetValidated(result: CSVValidationResult) {
    setSheetImportOpen(false);
    setValidation(result);
    setModalOpen(true);
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidating(true);
    setImportError("");

    try {
      const result = await validateCSV(file, existingIds);
      setValidation(result);
      setModalOpen(true);
    } catch (err) {
      setImportError(
        "Import failed: " +
          (err instanceof ImportStructureError
            ? err.problems.join(" ")
            : err instanceof Error
            ? err.message
            : "Unknown error")
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

        {/* Right — export (BL / Exec / Admin) + admin actions */}
        {canExport && (
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Export dropdown — client list or commission rates, to a new
                Google Sheet (CSV download kept as a fallback) */}
            <div ref={exportRef} className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                disabled={exporting !== null}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white disabled:opacity-50 transition-colors ${
                  exportOpen
                    ? "text-gray-900 bg-gray-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {exporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span className="hidden sm:inline">
                  {exporting ? "Exporting..." : "Export"}
                </span>
                <ChevronDown
                  size={13}
                  className={`transition-transform ${exportOpen ? "rotate-180" : ""}`}
                />
              </button>

              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-xl z-20">
                  <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    To a new Google Sheet
                  </p>
                  <button
                    onClick={() => handleSheetExport("clients")}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Users size={14} className="flex-shrink-0 text-gray-400" />
                    <span>
                      Client list
                      <span className="block text-xs text-gray-400">
                        All client info, with dropdowns
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => handleSheetExport("commissions")}
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
                  <div className="my-1 border-t border-gray-100" />
                  <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Download as CSV
                  </p>
                  <div className="flex gap-1 px-2 pb-1">
                    <button
                      onClick={() => {
                        exportClientsToCSV(exportableClients);
                        setExportOpen(false);
                      }}
                      className="flex-1 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                      Client list
                    </button>
                    <button
                      onClick={() => {
                        exportCommissionsToCSV(exportableClients);
                        setExportOpen(false);
                      }}
                      className="flex-1 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                      Commission rates
                    </button>
                  </div>
                </div>
              )}
            </div>

            {isAdmin && (
              <>

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

                {/* Give every client's team (BL / DL / GM) access — one-time backfill */}
                <button
                  onClick={() => setTeamAccessModalOpen(true)}
                  title="Give each client's Business Lead, Digital Lead and GM access to it"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <UserCheck size={14} />
                  <span className="hidden sm:inline">Team access</span>
                </button>

                {/* Import — paste a Google Sheet link (CSV upload inside the modal) */}
                <button
                  onClick={() => {
                    setImportError("");
                    setSheetImportOpen(true);
                  }}
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
              </>
            )}

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
        <MultiSelectDropdown
          label="Business Lead"
          options={businessLeadOptions}
          selectedValues={businessLeadFilter}
          onChange={onBusinessLeadFilterChange}
          searchable
        />

        {(agencyFilter.length > 0 ||
          tierFilter.length > 0 ||
          regionFilter.length > 0 ||
          verticalFilter.length > 0 ||
          businessLeadFilter.length > 0) && (
          <button
            onClick={() => {
              onAgencyFilterChange([]);
              onTierFilterChange([]);
              onRegionFilterChange([]);
              onVerticalFilterChange([]);
              onBusinessLeadFilterChange([]);
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

      {/* Google Sheets export result — a link rather than an automatic new
          tab, which browsers block after the consent popup. */}
      {exportedSheet && (
        <div className="flex items-center justify-between gap-3 bg-green-500 text-white px-4 py-3 mb-4 text-sm">
          <span className="flex items-center gap-2">
            <FileSpreadsheet size={15} />
            {exportedSheet.label} exported to a new Google Sheet in your Drive.
          </span>
          <span className="flex items-center gap-3 flex-shrink-0">
            <a
              href={exportedSheet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-medium underline underline-offset-2"
            >
              Open sheet <ExternalLink size={13} />
            </a>
            <button onClick={() => setExportedSheet(null)} title="Dismiss">
              <X size={15} />
            </button>
          </span>
        </div>
      )}
      {exportError && (
        <div className="flex items-center justify-between gap-3 bg-red-500 text-white px-4 py-3 mb-4 text-sm">
          <span>{exportError}</span>
          <button onClick={() => setExportError("")} title="Dismiss" className="flex-shrink-0">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Import step 1 — paste a Google Sheet link */}
      {sheetImportOpen && (
        <SheetImportModal
          existingIds={existingIds}
          onClose={() => setSheetImportOpen(false)}
          onValidated={handleSheetValidated}
          onUploadCSV={() => {
            setSheetImportOpen(false);
            fileInputRef.current?.click();
          }}
        />
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

      {/* Team access backfill — same refresh strategy. */}
      {teamAccessModalOpen && (
        <TeamAccessModal
          clients={clients}
          onClose={() => setTeamAccessModalOpen(false)}
          onApplied={() => window.location.reload()}
        />
      )}

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