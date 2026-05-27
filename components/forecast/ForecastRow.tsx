'use client';

import { EditableCell } from './EditableCell';
import { ForecastRow as ForecastRowType, MONTHS_LONG } from './types';
import { getMonthValue, getRowTotal, formatCurrency } from './utils';
import { useState } from 'react';

interface ForecastRowProps {
  row: ForecastRowType;
  isEditable: boolean;
  isAlternate: boolean;
}

export function ForecastRow({ row, isEditable, isAlternate }: ForecastRowProps) {
  const [rowData, setRowData] = useState<ForecastRowType>(row);

  const handleCellUpdate = (monthIndex: number, newValue: number) => {
    const monthField = MONTHS_LONG[monthIndex];
    setRowData({ ...rowData, [monthField]: newValue });
  };

  return (
    <tr className={isAlternate ? 'bg-gray-50' : 'bg-white'}>
      <td className={`px-4 py-3 font-medium text-gray-900 sticky left-0 z-10 ${isAlternate ? 'bg-gray-50' : 'bg-white'} min-w-[140px]`}>
        {row.FO_Channel}
      </td>
      {MONTHS_LONG.map((month, idx) => {
        const value = getMonthValue(rowData, idx);
        return (
          <td key={idx} className="px-3 py-2 text-right text-gray-700">
            <EditableCell
              value={value}
              rowId={row.id}
              monthIndex={idx}
              isEditable={isEditable}
              onUpdate={(newValue) => handleCellUpdate(idx, newValue)}
            />
          </td>
        );
      })}
      <td className="px-3 py-2 text-right font-semibold text-gray-900">
        {formatCurrency(getRowTotal(rowData))}
      </td>
    </tr>
  );
}
