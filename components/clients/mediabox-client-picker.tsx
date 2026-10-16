// components/clients/mediabox-client-picker.tsx
"use client";

/**
 * Picks the MediaBox / Planner client(s) a Forecaster client links to
 * (CL_MediaBox_IDs), by name, from `mediabox_clients` (pushed live by
 * MediaBox). The link decides who sees the client on the allocation tabs and
 * which MediaBox actuals are summed into it.
 *   - A MediaBox client already linked to another Forecaster client is
 *     flagged: sharing one double-counts its MediaBox totals.
 *   - A stored id that isn't a MediaBox client (removed, or a typo) still
 *     shows, flagged, so opening and saving never silently drops it.
 * Without the list (non-admins can't read it, or it failed to load) the
 * stored ids show as they are.
 */

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { MediaboxClientOption } from "../../lib/services/mediabox-clients-service";

const MAX_RESULTS = 10;

export default function MediaboxClientPicker({
  value,
  onChange,
  options,
  linkedElsewhere,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  /** null while loading or when unavailable. */
  options: MediaboxClientOption[] | null;
  /** MediaBox client id → the other Forecaster clients linked to it. */
  linkedElsewhere: ReadonlyMap<string, string[]>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map((options ?? []).map((o) => [o.id, o])), [options]);
  const picked = useMemo(() => new Set(value), [value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (options ?? [])
      .filter((o) => !picked.has(o.id))
      .filter((o) => !q || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [options, picked, query]);

  const pick = (id: string) => {
    onChange([...value, id]);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const o = byId.get(id);
            const others = linkedElsewhere.get(id) ?? [];
            return (
              <span key={id} className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 text-xs bg-gray-100 text-gray-800">
                <span className="truncate">{o ? `${o.name} · ${id}` : id}</span>
                {o && <span className="flex-shrink-0 text-gray-500">{o.allocatedCount} people</span>}
                {options && !o && (
                  <span
                    className="flex-shrink-0 px-1 text-[10px] font-semibold bg-yellow-400 text-gray-900"
                    title="No MediaBox client has this id — remove it, or pick the right one"
                  >
                    not in MediaBox
                  </span>
                )}
                {others.length > 0 && (
                  <span
                    className="flex-shrink-0 px-1 text-[10px] font-semibold bg-yellow-400 text-gray-900"
                    title={`Also linked to ${others.join(", ")} — its MediaBox totals count on both`}
                  >
                    also on {others.length === 1 ? others[0] : `${others.length} clients`}
                  </span>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((x) => x !== id))}
                    className="flex-shrink-0 text-gray-400 hover:text-gray-900"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      ) : (
        disabled && <p className="text-sm text-gray-400">—</p>
      )}

      {!disabled && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={options ? "Search MediaBox clients by name or id…" : "Loading MediaBox clients…"}
            disabled={!options}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // Delay so a click on a result lands before the list closes.
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent disabled:bg-gray-100"
          />
          {open && options && (
            <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-white border border-gray-200 shadow-lg">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-400">No matching MediaBox client.</li>
              ) : (
                results.map((o) => {
                  const others = linkedElsewhere.get(o.id) ?? [];
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(o.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                      >
                        <span className="block text-gray-900 truncate">{o.name}</span>
                        <span className="block text-xs text-gray-500 truncate">
                          {o.id} · {o.allocatedCount} people
                          {others.length > 0 && (
                            <span className="text-gray-900"> · already linked to {others.join(", ")}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
