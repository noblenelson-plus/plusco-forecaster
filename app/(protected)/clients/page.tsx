// app/(protected)/clients/page.tsx
"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Client } from "../../../lib/types/client.types";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import { fetchAccessibleClients } from "../../../lib/services/assignment-service";
import ClientGrid from "../../../components/clients/client-grid";
import ClientFilters from "../../../components/clients/client-filters";
import { useUsersMap } from "../../../lib/hooks/use-users-map";
import ClientDrawer from "../../../components/clients/client-drawer";
import PageHeader from "../../../components/_shared/page-header";
import type { ClientStatus } from "../../../lib/constants/client.constants";
import { resolveClientStatus, isClientHidden } from "../../../lib/format/client";
import { useForecastSelection } from "../../../lib/stores/forecast-selection.store";

export default function ClientsPage() {
  const { profile, isAdmin } = useUserProfile();

  // Status badge/filter follow the globally selected year (fallback: current year).
  const selectedYear = useForecastSelection((s) => s.selectedYear);
  const year = selectedYear ?? new Date().getFullYear();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state — the facet filters are multi-select; empty = no filter.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ClientStatus>("ALL");
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [tierFilter, setTierFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [verticalFilter, setVerticalFilter] = useState<string[]>([]);
  const [businessLeadFilter, setBusinessLeadFilter] = useState<string[]>([]);
  const usersMap = useUsersMap();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Fetch clients
  useEffect(() => {
    if (!profile) return;

    async function fetchClients() {
      setLoading(true);
      setError("");
      try {
        // Role-scoped fetch: admins see all; BLs see assigned clients ∪ every
        // client of an assigned agency. Already sorted by name.
        const data = await fetchAccessibleClients(profile, isAdmin);
        setClients(data);
      } catch (err: any) {
        setError("Failed to load clients: " + (err?.message ?? "Unknown error"));
      } finally {
        setLoading(false);
      }
    }

    fetchClients();
  }, [profile, isAdmin]);

  // Filtered clients. Hidden clients stay visible to admins (with a badge) but
  // are removed entirely for Business Leads — even on this page.
  // Business Lead filter options — distinct BLs in use, resolved to names.
  const businessLeadOptions = [
    ...new Set(clients.map((c) => c.CL_Business_Lead).filter(Boolean)),
  ]
    .map((uid) => ({ value: uid, label: usersMap.get(uid) ?? uid }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const filteredClients = clients.filter((c) => {
    if (isClientHidden(c) && !isAdmin) return false;
    const matchesSearch =
      c.CL_Name.toLowerCase().includes(search.toLowerCase()) ||
      c.CL_Agency.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || resolveClientStatus(c, year) === statusFilter;
    const matchesAgency =
      agencyFilter.length === 0 || agencyFilter.includes(c.CL_Agency);
    const matchesTier =
      tierFilter.length === 0 || tierFilter.includes(c.CL_Tier);
    const matchesRegion =
      regionFilter.length === 0 || regionFilter.includes(c.CL_Business_Unit_Region);
    // Unset verticals resolve to "" — matched by the "(Not set)" option.
    const matchesVertical =
      verticalFilter.length === 0 ||
      verticalFilter.includes(c.CL_Advertiser_Vertical ?? "");
    const matchesBusinessLead =
      businessLeadFilter.length === 0 ||
      businessLeadFilter.includes(c.CL_Business_Lead);
    return (
      matchesSearch &&
      matchesStatus &&
      matchesAgency &&
      matchesTier &&
      matchesRegion &&
      matchesVertical &&
      matchesBusinessLead
    );
  });

  // Handlers
  function handleAddClient() {
    setEditingClient(null);
    setDrawerOpen(true);
  }

  function handleEditClient(client: Client) {
    setEditingClient(client);
    setDrawerOpen(true);
  }

  function handleClientSaved(savedClient: Client) {
    setClients((prev) => {
      const exists = prev.find((c) => c.cl_id === savedClient.cl_id);
      let newClients;
      if (exists) {
        newClients = prev.map((c) => (c.cl_id === savedClient.cl_id ? savedClient : c));
      } else {
        newClients = [savedClient, ...prev];
      }
      // Re-sort in case a name changed or a new client was added
      return newClients.sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));
    });
    setDrawerOpen(false);
    setEditingClient(null);
  }

  function handleClientDeleted(cl_id: string) {
    setClients((prev) => prev.filter((c) => c.cl_id !== cl_id));
    setDrawerOpen(false);
    setEditingClient(null);
  }

  return (
    <div>

      {/* Sticky banner — full width, outside the padded container */}
      <PageHeader
        title="Clients"
        description={isAdmin ? "Manage all agency clients." : "Your assigned clients."}
        actions={
          <>
            <a
              href="https://forms.gle/cpM6WpJJwbipDHf77"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <ExternalLink size={14} />
              <span>New Client Request Form</span>
            </a>
            <a
              href="https://forms.gle/qhvSxDesNGHgcnwJ7"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <ExternalLink size={14} />
              <span>Client Access Request Form</span>
            </a>
          </>
        }
      />

      {/* Page content — the padding lives here, not on the header */}
      <div className="p-6 max-w-7xl mx-auto">

        {/* Filters + actions */}
        <ClientFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          agencyFilter={agencyFilter}
          onAgencyFilterChange={setAgencyFilter}
          tierFilter={tierFilter}
          onTierFilterChange={setTierFilter}
          regionFilter={regionFilter}
          onRegionFilterChange={setRegionFilter}
          verticalFilter={verticalFilter}
          onVerticalFilterChange={setVerticalFilter}
          businessLeadFilter={businessLeadFilter}
          onBusinessLeadFilterChange={setBusinessLeadFilter}
          businessLeadOptions={businessLeadOptions}
          clients={clients}
          filteredClients={filteredClients}
          isAdmin={isAdmin}
          onAddClient={handleAddClient}
        />

        {/* Error */}
        {error && (
          <div className="bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Grid */}
        <ClientGrid
          clients={filteredClients}
          loading={loading}
          isAdmin={isAdmin}
          onEditClient={handleEditClient}
        />

        {/* Drawer */}
        <ClientDrawer
          open={drawerOpen}
          client={editingClient}
          isAdmin={isAdmin}
          onClose={() => {
            setDrawerOpen(false);
            setEditingClient(null);
          }}
          onSaved={handleClientSaved}
          onDeleted={handleClientDeleted}
        />

      </div>
    </div>
  );
}