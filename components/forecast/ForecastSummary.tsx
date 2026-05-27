'use client';

import { ForecastRow } from './types';
import { getMonthTotal, formatCurrency } from './utils';
import { MONTHS_LONG } from './types';

interface ForecastSummaryProps {
  rows: ForecastRow[];
}

export function ForecastSummary({ rows }: ForecastSummaryProps) {
  const getTotal = (): number => {
    let total = 0;
    for (let i = 0; i < 12; i++) {
      total += getMonthTotal(rows, i);
    }
    return total;
  };

  return (
    <tr className="bg-gray-100 border-t-2 border-gray-300 border-b-2">
      <td className="px-4 py-3 font-bold text-gray-900 sticky left-0 bg-gray-100 z-10 min-w-[140px]">
        TOTAL
      </td>
      {MONTHS_LONG.map((_, idx) => (
        <td key={idx} className="px-3 py-3 text-right font-bold text-gray-900">
          {formatCurrency(getMonthTotal(rows, idx))}
        </td>
      ))}
      <td className="px-3 py-3 text-right font-bold text-gray-900">
        {formatCurrency(getTotal())}
      </td>
    </tr>
  );
}
