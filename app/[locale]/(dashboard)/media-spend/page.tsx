'use client';

import { useClientRFQ } from '@/lib/client-rfq-context';
import { useTranslations } from 'next-intl';
import { ForecastTable } from '@/components/forecast';
import { Lock } from 'lucide-react';

export default function MediaSpendPage() {
  const { selectedClient, selectedRFQ, isRFQLocked } = useClientRFQ();
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-gray-900">{t('nav.mediaSpend')}</h1>

        {/* Client & RFQ Info */}
        <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-4">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase">Client</span>
            <p className="text-sm font-medium text-gray-800">{selectedClient?.name || 'No client selected'}</p>
          </div>
          <div className="border-l border-gray-200" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase">RFQ</span>
            <div>
              <p className="text-sm font-medium text-gray-800">{selectedRFQ?.label || 'No RFQ selected'}</p>
              {selectedRFQ && (
                isRFQLocked
                  ? <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-1"><Lock size={10} /> Read-only</span>
                  : <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-1">Editable</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Forecast Table */}
      <div className="bg-white rounded-lg shadow-sm">
        <ForecastTable />
      </div>
    </div>
  );
}
