// components/clients/client-grid.tsx
"use client";

import { Client } from "../../lib/types/client.types";
import ClientCard from "./client-card";
import { Briefcase, Loader2 } from "lucide-react";

interface ClientGridProps {
  clients: Client[];
  loading: boolean;
  isAdmin: boolean;
  onEditClient: (client: Client) => void;
}

export default function ClientGrid({
  clients,
  loading,
  isAdmin,
  onEditClient,
}: ClientGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading clients...</span>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Briefcase size={24} className="opacity-40" />
        </div>
        <p className="text-sm font-medium text-gray-500">No clients found</p>
        <p className="text-xs text-gray-400 mt-1">
          {isAdmin
            ? "Add your first client using the button above."
            : "No clients have been assigned to you yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {clients.map((client) => (
        <ClientCard
          key={client.cl_id}
          client={client}
          isAdmin={isAdmin}
          onEdit={onEditClient}
        />
      ))}
    </div>
  );
}