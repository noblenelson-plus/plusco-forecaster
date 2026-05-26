"use client";

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Lock, Unlock, FileCheck } from 'lucide-react';
import { useClientRFQ } from '@/lib/client-rfq-context';

export default function RFQDropdown() {
  const { rfqs, selectedRFQ, setSelectedRFQ, rfqsLoading, isRFQLocked } = useClientRFQ();
  const t = useTranslations('sidebar');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (rfqsLoading) {
    return (
      <div className="px-3 py-2">
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3 mb-4">
      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1 block">
        {t('rfq')}
      </label>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between px-3 py-2.5 rounded-lg
          text-sm font-medium border transition-all duration-150
          ${isOpen
            ? 'border-blue-500 ring-2 ring-blue-100 bg-white'
            : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
          }
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCheck size={16} className="text-gray-400 flex-shrink-0" />
          <span className="truncate text-gray-800">
            {selectedRFQ ? selectedRFQ.label : t('selectRFQ')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedRFQ && (
            isRFQLocked
              ? <Lock size={12} className="text-amber-500" />
              : <Unlock size={12} className="text-green-500" />
          )}
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-3 right-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {rfqs.map((rfq) => (
              <button
                key={`${rfq.year}-${rfq.rfq}`}
                onClick={() => {
                  setSelectedRFQ(rfq);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center justify-between px-3 py-2.5 text-sm
                  transition-colors duration-100
                  ${selectedRFQ?.year === rfq.year && selectedRFQ?.rfq === rfq.rfq
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <span>{rfq.label}</span>
                <div className="flex items-center gap-1.5">
                  {rfq.status === 'Locked' ? (
                    <>
                      <Lock size={12} className="text-amber-500" />
                      <span className="text-[11px] text-amber-500 font-medium">{t('locked')}</span>
                    </>
                  ) : (
                    <>
                      <Unlock size={12} className="text-green-500" />
                      <span className="text-[11px] text-green-500 font-medium">{t('unlocked')}</span>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
