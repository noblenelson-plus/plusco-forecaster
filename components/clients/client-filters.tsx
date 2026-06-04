// components/clients/client-filters.tsx
"use client";

import { useRef, useState } from "react";
import { Search, Plus, Upload, Download } from "lucide-react";
import { Client } from "../../lib/types/client.types";
import { ClientStatus } from "../../lib/constants/client.constants";
import { exportClientsToCSV, validateCSV, CSVValidationResult } from "../../lib/services/client-service";
import ImportModal from "./import-modal";

type StatusFilter = "ALL" | ClientStatus;

interface ClientFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
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

export default function ClientFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
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

  function handleExport() {
    exportClientsToCSV(clients);
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidating(true);
    setImportError("");

    try {
      const result = await validateCSV(file);
      setValidation(result);
      setModalOpen(true);
    } catch (err: any) {
      setImportError("Import failed: " + (err?.message ?? "Unknown error"));
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">

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
                    ? "bg-white text-gray-900 shadow-sm"
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

            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
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

      {/* Import error (fatal — before modal) */}
      {importError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
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
    </>
  );
}