"use client";

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search, Building2 } from 'lucide-react';
import { useClientRFQ, Client } from '@/lib/client-rfq-context';

function ClientAvatar({ client, selected }: { client: Client; selected?: boolean }) {
  const initials = client.name.charAt(0).toUpperCase();
  const badgeClasses = selected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500';

  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${badgeClasses}`}>
      {initials}
    </div>
  );
}

export default function ClientDropdown() {
  const { clients, selectedClient, setSelectedClient, clientsLoading } = useClientRFQ();
  const t = useTranslations('sidebar');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (clientsLoading) {
    return (
      <div className="px-3 py-2">
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3 mb-2">
      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1 block">
        {t('client')}
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
          <Building2 size={16} className="text-gray-400 shrink-0" />
          {selectedClient && <ClientAvatar client={selectedClient} selected />}
          <span className="truncate text-gray-800">
            {selectedClient ? selectedClient.name : t('selectClient')}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-3 right-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchClient')}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filteredClients.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                {t('noClientsFound')}
              </div>
            ) : (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    setSelectedClient(client);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left
                    transition-colors duration-100
                    ${selectedClient?.id === client.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <ClientAvatar client={client} selected={selectedClient?.id === client.id} />
                  <div className="min-w-0">
                    <div className="truncate">{client.name}</div>
                    {client.agency && (
                      <div className="text-[11px] text-gray-400 truncate">{client.agency}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
