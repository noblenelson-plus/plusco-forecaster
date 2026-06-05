// app/(protected)/clients/page.tsx
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Client } from "../../../lib/types/client.types";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import ClientGrid from "../../../components/clients/client-grid";
import ClientFilters from "../../../components/clients/client-filters";
import ClientDrawer from "../../../components/clients/client-drawer";
import PageHeader from "../../../components/_shared/page-header";
import type { ClientStatus } from "../../../lib/constants/client.constants";

// Firestore limite les requêtes "in" à 30 valeurs — on découpe en lots
const IN_QUERY_LIMIT = 30;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default function ClientsPage() {
  const { profile, isAdmin } = useUserProfile();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ClientStatus>("ALL");
  const [agencyFilter, setAgencyFilter] = useState<"ALL" | string>("ALL");

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
        let docs;

        if (isAdmin) {
          // Admins see all clients
          const snapshot = await getDocs(collection(db, "clients"));
          docs = snapshot.docs;
        } else {
          // BLs only see assigned clients
          const assigned = profile?.assignedClients ?? [];
          if (assigned.length === 0) {
            setClients([]);
            setLoading(false);
            return;
          }

          // Firestore "in" supporte max 30 valeurs → requêtes par lots
          // de 30, exécutées en parallèle puis fusionnées
          const snapshots = await Promise.all(
            chunk(assigned, IN_QUERY_LIMIT).map((ids) =>
              getDocs(
                query(collection(db, "clients"), where("__name__", "in", ids))
              )
            )
          );
          docs = snapshots.flatMap((s) => s.docs);
        }

        const data = docs.map((d) => ({
          cl_id: d.id,
          ...(d.data() as Omit<Client, "cl_id">),
        }));
        setClients(data);
      } catch (err: any) {
        setError("Failed to load clients: " + (err?.message ?? "Unknown error"));
      } finally {
        setLoading(false);
      }
    }

    fetchClients();
  }, [profile, isAdmin]);

  // Filtered clients
  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.CL_Name.toLowerCase().includes(search.toLowerCase()) ||
      c.CL_Agency.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || c.Client_Status_2026 === statusFilter;
    const matchesAgency =
      agencyFilter === "ALL" || c.CL_Agency === agencyFilter;
    return matchesSearch && matchesStatus && matchesAgency;
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
      if (exists) {
        return prev.map((c) => (c.cl_id === savedClient.cl_id ? savedClient : c));
      }
      return [savedClient, ...prev];
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

      {/* Bandeau sticky — pleine largeur, hors du conteneur paddé */}
      <PageHeader
        title="Clients"
        description={isAdmin ? "Manage all agency clients." : "Your assigned clients."}
      />

      {/* Contenu de page — le padding vit ici, pas sur le header */}
      <div className="p-6 max-w-7xl mx-auto">

        {/* Filters + actions */}
        <ClientFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          agencyFilter={agencyFilter}
          onAgencyFilterChange={setAgencyFilter}
          clients={clients}
          filteredClients={filteredClients}
          isAdmin={isAdmin}
          onAddClient={handleAddClient}
        />

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
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