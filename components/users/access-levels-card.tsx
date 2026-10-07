// components/users/access-levels-card.tsx
"use client";

import { Briefcase, LayoutDashboard, Shield, Clock, type LucideIcon } from "lucide-react";

/**
 * Explains where access comes from. Shown on the admin Users page so admins
 * understand the model before changing someone's role. Mirrors
 * lib/format/access.ts — keep the copy in sync if the model changes.
 */

interface Tier {
  icon: LucideIcon;
  title: string;
  detail: string;
}

const TIERS: Tier[] = [
  {
    icon: Briefcase,
    title: "Client team",
    detail:
      "GM, Business Lead, Digital Lead and collaborators of a client (set on the client). They edit that client's forecast, flags and milestones (never actuals) and see it on the Forecaster dashboard.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard access",
    detail:
      "Granted per dashboard to email domains or people (Admin → Dashboard Access). Global mode shows every client; Agency mode the clients of the person's agency (every agency for company-wide domains).",
  },
  {
    icon: Shield,
    title: "Admin",
    detail:
      "Manages users, clients, actuals, dashboards and the agency ↔ domain mapping. Sees and edits every client.",
  },
  {
    icon: Clock,
    title: "No team, no dashboard",
    detail:
      "Signing in creates the user row, but the person sees an “Access pending” screen until they are put on a client team or granted a dashboard.",
  },
];

export default function AccessLevelsCard({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl p-4 ${className}`}
    >
      <h2 className="text-sm font-semibold text-gray-900 mb-3">
        Access levels
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {TIERS.map(({ icon: Icon, title, detail }) => (
          <li key={title} className="flex gap-3">
            <div className="w-7 h-7 bg-gray-900 flex items-center justify-center flex-shrink-0">
              <Icon size={14} className="text-yellow-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                {title}
              </p>
              <p className="text-xs text-gray-500 leading-snug mt-0.5">
                {detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
