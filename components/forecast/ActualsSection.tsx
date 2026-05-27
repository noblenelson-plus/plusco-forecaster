'use client';

import { ForecastRow } from './types';
import { MONTHS_LONG } from './types';
import { getMonthValue, formatCurrency, getRowTotal } from './utils';

interface ActualsSectionProps {
  rows: ForecastRow[];
  totalActuals: number;
}

export function ActualsSection({ rows, totalActuals }: ActualsSectionProps) {
  if (rows.length === 0) return null;

  return (
    <>
      <tr className="h-1 bg-green-500" />
      <tr className="bg-green-100 border-b border-green-200">
        <td colSpan={14} className="px-4 py-2 text-sm font-bold text-green-800">
          00_Actuals {formatCurrency(totalActuals)}
        </td>
      </tr>

      {rows.map((row, idx) => (
        <tr key={row.id} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
          <td className={`px-4 py-3 font-medium text-gray-900 sticky left-0 z-10 min-w-[140px] ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
            {row.FO_Channel}
          </td>
          {MONTHS_LONG.map((_, monthIdx) => (
            <td key={monthIdx} className="px-3 py-2 text-right text-gray-700">
              {formatCurrency(getMonthValue(row, monthIdx))}
            </td>
          ))}
          <td className="px-3 py-2 text-right font-semibold text-gray-900">
            {formatCurrency(getRowTotal(row))}
          </td>
        </tr>
      ))}
    </>
  );
}
