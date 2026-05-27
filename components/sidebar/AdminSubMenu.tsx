'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Shield, ChevronDown } from 'lucide-react';
import NavItem from './NavItem';
import { adminSubItems } from './navConfig';

export default function AdminSubMenu() {
  const pathname = usePathname();
  const locale = pathname?.split('/')[1] || 'en';
  const t = useTranslations('nav');

  const isAdminActive = pathname?.includes(`/${locale}/admin`);
  const [isOpen, setIsOpen] = useState(isAdminActive);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between px-3 py-2.5 rounded-lg
          text-sm font-medium transition-all duration-150 ease-in-out
          ${isAdminActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
        `}
      >
        <div className="flex items-center gap-3">
          <Shield size={18} className={isAdminActive ? 'text-blue-600' : 'text-gray-400'} />
          <span>{t('admin')}</span>
        </div>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isAdminActive ? 'text-blue-600' : 'text-gray-400'}`}
        />
      </button>

      {isOpen && (
        <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-200 pl-3">
          {adminSubItems.map((item) => (
            <NavItem
              key={item.href}
              labelKey={item.labelKey}
              href={item.href}
              icon={item.icon}
              translationNamespace="adminSub"
            />
          ))}
        </div>
      )}
    </div>
  );
}
