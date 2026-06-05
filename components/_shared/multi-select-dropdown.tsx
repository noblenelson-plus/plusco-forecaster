//# filepath: components/_shared/multi-select-dropdown.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

export default function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  searchable = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useClickOutside(() => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opening
  useEffect(() => {
    if (open && searchable) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  const handleSelectAll = () => {
    onChange(options.map((o) => o.value));
  };

  const hasSelection = selectedValues.length > 0;
  const displayLabel = hasSelection ? `${label} (${selectedValues.length})` : label;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 min-w-[140px] text-sm rounded-lg border transition-colors ${
          open
            ? "bg-white border-yellow-400 ring-1 ring-yellow-400"
            : hasSelection
            ? "bg-yellow-50 border-yellow-300 text-yellow-900 hover:bg-yellow-100"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span className={`truncate font-medium ${hasSelection && !open ? "text-yellow-800" : ""}`}>
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180 text-gray-500" : "text-gray-400"} ${hasSelection && !open ? "text-yellow-600" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[300px]">
          {searchable && (
            <div className="relative border-b border-gray-100 flex-shrink-0">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50/50 focus:outline-none focus:bg-white transition-colors"
              />
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!hasSelection}
              className="text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>

          <div className="overflow-y-auto py-1 flex-1">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center text-gray-500">
                No options found.
              </p>
            ) : (
              <ul className="flex flex-col">
                {filteredOptions.map((opt) => {
                  const isSelected = selectedValues.includes(opt.value);
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        onClick={() => handleToggle(opt.value)}
                        className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? "bg-yellow-400 border-yellow-400 text-gray-900"
                              : "bg-white border-gray-300"
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                        <span className={`text-sm truncate ${isSelected ? "text-gray-900 font-medium" : "text-gray-700"}`}>
                          {opt.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}