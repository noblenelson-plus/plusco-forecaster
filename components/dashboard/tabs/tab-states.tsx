// components/dashboard/tabs/tab-states.tsx

/**
 * Shared placeholder states for the dashboard tabs: missing Year/RFQ context,
 * in-flight loading, and a "no data entered yet" notice.
 */

import { Loader2, MousePointerClick, Inbox } from "lucide-react";

export function NoContextNotice() {
  return (
    <Centered icon={<MousePointerClick size={22} className="opacity-40" />}>
      <p className="text-sm font-medium text-gray-500">Select a Year and a submission</p>
      <p className="mt-1 text-xs text-gray-400">
        Use the context bar above to choose the Year + RFQ to analyze.
      </p>
    </Centered>
  );
}

export function LoadingTab() {
  return (
    <div className="flex h-72 items-center justify-center text-gray-400">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

export function EmptyDataNotice({ message }: { message?: string }) {
  return (
    <Centered icon={<Inbox size={22} className="opacity-40" />}>
      <p className="text-sm font-medium text-gray-500">No data for this scope yet</p>
      <p className="mt-1 text-xs text-gray-400">
        {message ??
          "No forecast has been entered for the selected clients, year and submission."}
      </p>
    </Centered>
  );
}

function Centered({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
        {icon}
      </div>
      {children}
    </div>
  );
}
