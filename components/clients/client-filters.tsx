// components/clients/client-filters.tsx
"use client";

import { useRef } from "react";
import { Search, Plus, Upload, Download } from "lucide-react";
import { Client } from "../../lib/types/client.types";
import { exportClientsToCSV, parseClientsFromCSV } from "../../lib/services/client-service";

interface ClientFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: "ALL" | "ACTIVE" | "INACTIVE";
  onStatusFilterChange: (value: "ALL" | "ACTIVE" | "INACTIVE") => void;
  clients: Client[];
  filteredClients: Client[];
  isAdmin: boolean;
  onAddClient: () => void;
}

const STATUS_OPTIONS: { value: "ALL" | "ACTIVE" | "INACTIVE"; label: string }[] = [
  { value: "ALL",      label: "All" },
  { value: "ACTIVE",   label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
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

  function handleExport() {
    exportClientsToCSV(clients);
  }

  async function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await parseClientsFromCSV(file);
      // Reset input so the same file can be re-uploaded if needed
      e.target.value = "";
      // Reload page to reflect newly imported clients
      window.location.reload();
    } catch (err: any) {
      alert("Import failed: " + (err?.message ?? "Unknown error"));
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">

      {/* Left — search + status filter */}
      <div className="flex items-center gap-2 flex-1 min-w-0">

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
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
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
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
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">Import</span>
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
  );
}