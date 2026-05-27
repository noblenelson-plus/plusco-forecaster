"use client";

import { useClientRFQ } from '@/lib/client-rfq-context';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';

export default function HelpPage() {
  const { selectedClient, selectedRFQ, isRFQLocked } = useClientRFQ();
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-2xl">❓</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t('nav.help')}</h1>
      <p className="text-gray-500 mb-6">{t('pages.comingSoon')}</p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-sm w-full text-left space-y-3">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase">Client</span>
          <p className="text-sm font-medium text-gray-800">{selectedClient?.name || 'No client selected'}</p>
        </div>
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase">RFQ</span>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-800">{selectedRFQ?.label || 'No RFQ selected'}</p>
            {selectedRFQ && (
              isRFQLocked
                ? <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><Lock size={10} /> Read-only</span>
                : <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Editable</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
