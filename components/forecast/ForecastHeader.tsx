'use client';

import { useTranslations } from 'next-intl';
import { MONTHS_LONG } from './types';

export function ForecastHeader() {
  const t = useTranslations();

  const getTranslatedMonth = (monthName: string): string => {
    const key = `months.${monthName.toLowerCase()}`;
    return t.has(key) ? t(key) : monthName;
  };

  return (
    <thead className="bg-yellow-100 border-b-2 border-yellow-400 sticky top-0 z-10">
      <tr>
        <th className="px-4 py-3 text-left font-semibold text-gray-900 sticky left-0 bg-yellow-100 z-20 min-w-[140px]">
          Label
        </th>
        {MONTHS_LONG.map((month, idx) => (
          <th key={idx} className="px-3 py-3 text-right font-semibold text-gray-900 min-w-[120px]">
            {getTranslatedMonth(month)}
          </th>
        ))}
        <th className="px-3 py-3 text-right font-semibold text-gray-900 min-w-[120px]">
          Total
        </th>
      </tr>
    </thead>
  );
}
