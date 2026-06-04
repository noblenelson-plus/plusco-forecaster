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
import type { ClientStatus } from "../../../lib/constants/client.constants";


export default function ClientsPage() {
  const { profile, isAdmin } = useUserProfile();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state
  const [search, setSearch] = useState("");
const [statusFilter, setStatusFilter] = useState<"ALL" | ClientStatus>("ALL");

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
        let snapshot;

        if (isAdmin) {
          // Admins see all clients
          snapshot = await getDocs(collection(db, "clients"));
        } else {
          // BLs only see assigned clients
          const assigned = profile?.assignedClients ?? [];
          if (assigned.length === 0) {
            setClients([]);
            setLoading(false);
            return;
          }
          // Firestore "in" query supports up to 30 items
          snapshot = await getDocs(
            query(collection(db, "clients"), where("__name__", "in", assigned))
          );
        }

        const data = snapshot.docs.map((d) => ({
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
      return matchesSearch && matchesStatus;
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
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin
            ? "Manage all agency clients."
            : "Your assigned clients."}
        </p>
      </div>

      {/* Filters + actions */}
      <ClientFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
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
        onClose={() => {
          setDrawerOpen(false);
          setEditingClient(null);
        }}
        onSaved={handleClientSaved}
        onDeleted={handleClientDeleted}
      />

    </div>
  );
}