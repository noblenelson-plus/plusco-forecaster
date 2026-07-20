// filepath: components/forecaster/forecaster-context-bar.tsx

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface ForecasterContextBarProps {
  primaryYear: string;
  onPrimaryYearChange: (value: string) => void;
  primaryRfq: string;
  onPrimaryRfqChange: (value: string) => void;
  primaryType: string;
  onPrimaryTypeChange: (value: string) => void;
  comparisonYear?: string;
  onComparisonYearChange?: (value: string) => void;
  comparisonRfq?: string;
  onComparisonRfqChange?: (value: string) => void;
  comparisonType?: string;
  onComparisonTypeChange?: (value: string) => void;
  showComparison?: boolean;
}

const AVAILABLE_YEARS = ['2023', '2024', '2025', '2026'];
const AVAILABLE_RFQS = ['RFQ1', 'RFQ2', 'RFQ3', 'RFQ4', 'Actuals'];
const AVAILABLE_TYPES = ['Bottom Line', 'Official'];

export function ForecasterContextBar({
  primaryYear,
  onPrimaryYearChange,
  primaryRfq,
  onPrimaryRfqChange,
  primaryType,
  onPrimaryTypeChange,
  comparisonYear = '2025',
  onComparisonYearChange,
  comparisonRfq = 'RFQ4',
  onComparisonRfqChange,
  comparisonType = 'Official',
  onComparisonTypeChange,
  showComparison = true,
}: ForecasterContextBarProps) {
  return (
    <Card className="rounded-none border-x-0 border-t-0 border-b border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left Section: Context Meta */}
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="rounded-none border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary"
          >
            Forecaster 2.0
          </Badge>
          <div className="h-4 w-[1px] bg-border" />
          <span className="text-xs text-muted-foreground">
            Read-Only Reporting Context
          </span>
        </div>

        {/* Right Section: Comparison & Primary Selection Controls */}
        <div className="flex flex-wrap items-center gap-6">
          {/* Primary View Selectors */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Primary:
            </span>

            {/* Primary Year Selector */}
            <select
              value={primaryYear}
              onChange={(e) => onPrimaryYearChange(e.target.value)}
              className="h-8 w-[90px] cursor-pointer rounded-none border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {AVAILABLE_YEARS.map((yr) => (
                <option key={`p-yr-${yr}`} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            {/* Primary RFQ Selector */}
            <select
              value={primaryRfq}
              onChange={(e) => onPrimaryRfqChange(e.target.value)}
              className="h-8 w-[100px] cursor-pointer rounded-none border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {AVAILABLE_RFQS.map((rfq) => (
                <option key={`p-rfq-${rfq}`} value={rfq}>
                  {rfq}
                </option>
              ))}
            </select>

            {/* Primary Type Selector */}
            <select
              value={primaryType}
              onChange={(e) => onPrimaryTypeChange(e.target.value)}
              className="h-8 w-[120px] cursor-pointer rounded-none border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {AVAILABLE_TYPES.map((t) => (
                <option key={`p-type-${t}`} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Comparison View Selectors */}
          {showComparison && (
            <>
              <div className="hidden h-4 w-[1px] bg-border sm:block" />

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Benchmark:
                </span>

                {/* Benchmark Year Selector */}
                <select
                  value={comparisonYear}
                  onChange={(e) => onComparisonYearChange?.(e.target.value)}
                  className="h-8 w-[90px] cursor-pointer rounded-none border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {AVAILABLE_YEARS.map((yr) => (
                    <option key={`c-yr-${yr}`} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>

                {/* Benchmark RFQ Selector */}
                <select
                  value={comparisonRfq}
                  onChange={(e) => onComparisonRfqChange?.(e.target.value)}
                  className="h-8 w-[100px] cursor-pointer rounded-none border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {AVAILABLE_RFQS.map((rfq) => (
                    <option key={`c-rfq-${rfq}`} value={rfq}>
                      {rfq}
                    </option>
                  ))}
                </select>

                {/* Benchmark Type Selector */}
                <select
                  value={comparisonType}
                  onChange={(e) => onComparisonTypeChange?.(e.target.value)}
                  className="h-8 w-[120px] cursor-pointer rounded-none border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {AVAILABLE_TYPES.map((t) => (
                    <option key={`c-type-${t}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}