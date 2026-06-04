// components/clients/client-card.tsx
"use client";

import { Client } from "../../lib/types/client.types";
import { Building2, DollarSign, Tag } from "lucide-react";

interface ClientCardProps {
  client: Client;
  isAdmin: boolean;
  onEdit: (client: Client) => void;
}

const TIER_LABELS: Record<string, string> = {
  TIER_1: "Tier 1",
  TIER_2: "Tier 2",
  TIER_3: "Tier 3",
};

const TIER_COLORS: Record<string, string> = {
  TIER_1: "bg-yellow-100 text-yellow-800",
  TIER_2: "bg-blue-100 text-blue-800",
  TIER_3: "bg-gray-100 text-gray-600",
};

export default function ClientCard({ client, isAdmin, onEdit }: ClientCardProps) {
  // Generate initials from client name
  const initials = client.CL_Name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Distinct background color per client based on name hash
  const bgColors = [
    "bg-yellow-400",
    "bg-blue-400",
    "bg-emerald-400",
    "bg-rose-400",
    "bg-violet-400",
    "bg-orange-400",
    "bg-teal-400",
    "bg-pink-400",
  ];
  const colorIndex =
    client.CL_Name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    bgColors.length;
  const avatarBg = bgColors[colorIndex];

  const isActive = client.Client_Status_2026 === "ACTIVE";

  return (
    <button
      onClick={() => onEdit(client)}
      className="group w-full text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-yellow-400 hover:shadow-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-yellow-400"
    >
      {/* Top row — logo/avatar + status */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-11 h-11 rounded-xl ${
            client.CL_Logo ? "bg-transparent" : avatarBg
          } flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden`}
        >
          {client.CL_Logo ? (
            <img
              src={client.CL_Logo}
              alt={`${client.CL_Name} logo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-sm font-bold">{initials}</span>
          )}
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            isActive
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-gray-100 text-gray-500 border border-gray-200"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
              isActive ? "bg-emerald-500" : "bg-gray-400"
            }`}
          />
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Client name */}
      <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 group-hover:text-yellow-600 transition-colors truncate">
        {client.CL_Name}
      </h3>

      {/* Agency */}
      <div className="flex items-center gap-1.5 mb-4">
        <Building2 size={12} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-500 truncate">{client.CL_Agency}</span>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 pt-3 flex items-center justify-between gap-2">
        {/* Tier badge */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
            TIER_COLORS[client.CL_Tier] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          <Tag size={10} />
          {TIER_LABELS[client.CL_Tier] ?? client.CL_Tier}
        </span>

        {/* Currency */}
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <DollarSign size={11} />
          <span>{client.CL_Currency}</span>
        </div>
      </div>
    </button>
  );
}