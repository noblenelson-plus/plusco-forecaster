// components/users/access-levels-card.tsx
"use client";

import { Eye, Briefcase, BarChart3, Shield, type LucideIcon } from "lucide-react";

/**
 * Explains the four access tiers. Shown on the admin Users page so admins
 * understand what each role grants before changing someone's role. Mirrors the
 * model in user.types.ts — keep the copy in sync if the tiers change.
 */

interface Tier {
  icon: LucideIcon;
  title: string;
  detail: string;
}

const TIERS: Tier[] = [
  {
    icon: Eye,
    title: "Agency Viewer",
    detail:
      "Granted automatically from the email domain. Read-only, Dashboard tab only (Media Spend, Product, Labs, MediaOcean, MediaBox) — for their agency's clients. No revenue.",
  },
  {
    icon: Briefcase,
    title: "Business Lead",
    detail:
      "Assigned to specific clients. Can edit the forecast and milestones of those clients (never the actuals), and see revenue.",
  },
  {
    icon: BarChart3,
    title: "Exec",
    detail:
      "Like a Business Lead across every client of their domain — no per-client assignment needed — plus a global dashboard covering all clients.",
  },
  {
    icon: Shield,
    title: "Admin",
    detail:
      "Manages users, clients, actuals and the agency ↔ domain mapping. Full access.",
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
