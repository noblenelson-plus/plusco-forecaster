// components/progression/milestone-status.tsx
"use client";

/**
 * Shared look of the three milestone statuses on the Milestones page (table
 * icons, status chips, summary tiles and bars): validated = green, flags to
 * justify = yellow, not validated = gray.
 */

import { AlertTriangle, Check, Minus } from "lucide-react";
import type { RfqValidationStatus } from "../../lib/types/forecast-flags.types";

export const STATUS_META: Record<
  RfqValidationStatus,
  { label: string; icon: typeof Check; chip: string; bar: string }
> = {
  validated: { label: "Validated", icon: Check, chip: "bg-green-500 text-white", bar: "bg-green-500" },
  failed: { label: "Flags to justify", icon: AlertTriangle, chip: "bg-yellow-400 text-gray-900", bar: "bg-yellow-400" },
  not_validated: { label: "Not validated", icon: Minus, chip: "bg-gray-200 text-gray-500", bar: "bg-gray-300" },
};

export function StatusIcon({ status }: { status: RfqValidationStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      className={`inline-flex h-5 w-5 items-center justify-center ${meta.chip}`}
    >
      <Icon size={12} />
    </span>
  );
}
