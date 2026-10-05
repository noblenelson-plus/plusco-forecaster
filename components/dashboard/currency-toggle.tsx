// components/dashboard/currency-toggle.tsx
"use client";

/**
 * CAD / USD view toggle for the full-year tabs (Labs Pacing, Exec KPI), sitting
 * in the filter bar's right-hand slot. The "All amounts in CAD" note and the
 * USD→CAD rate applied live in its tooltip; a missing rate stays visible as a
 * chip, since it changes the numbers. (The Forecaster tab keeps its own toggle
 * on the Time & Context bar.)
 */

import { AlertTriangle } from "lucide-react";
import type { Currency } from "../../lib/types/client.types";

export default function CurrencyToggle({
  viewCurrency,
  onChange,
  usdToCad,
  usdClientCount = 0,
  missingRate = false,
}: {
  viewCurrency: Currency;
  onChange: (c: Currency) => void;
  usdToCad?: number;
  usdClientCount?: number;
  missingRate?: boolean;
}) {
  const tooltip =
    viewCurrency === "USD"
      ? "USD view: only USD clients, shown in native USD."
      : `All amounts in CAD.${
          usdClientCount > 0 && usdToCad != null
            ? ` ${usdClientCount} USD client${usdClientCount > 1 ? "s" : ""} converted at 1 USD = ${usdToCad} CAD.`
            : ""
        }`;

  return (
    <div className="flex items-center gap-2">
      {missingRate && (
        <span
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-yellow-400 bg-yellow-400 text-gray-900"
          title="No USD→CAD rate is configured for this year in Admin → Currency. USD clients are shown unconverted."
        >
          <AlertTriangle size={13} />
          Missing USD→CAD rate
        </span>
      )}
      <div
        className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold"
        title={tooltip}
      >
        {(["CAD", "USD"] as Currency[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`px-3 py-1.5 transition-colors ${
              viewCurrency === c
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
