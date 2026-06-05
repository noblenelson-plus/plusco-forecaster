// components/dashboard/widgets/dashboard-grid.tsx
"use client";

/**
 * Renders the widget registry into a responsive grid. Each widget gets the same
 * scope; a widget with `span: 2` takes the full width on large screens.
 */

import { WIDGETS } from "../../../lib/dashboard/widgets/registry";
import type { DashboardScope } from "../../../lib/dashboard/widgets/widget.types";

export default function DashboardGrid({ scope }: { scope: DashboardScope }) {
  if (WIDGETS.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
        No widgets registered yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {WIDGETS.map(({ id, span, Component }) => (
        <div key={id} className={span === 2 ? "lg:col-span-2" : ""}>
          <Component scope={scope} />
        </div>
      ))}
    </div>
  );
}
