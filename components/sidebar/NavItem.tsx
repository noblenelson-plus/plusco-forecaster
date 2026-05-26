'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';

interface NavItemProps {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  translationNamespace?: string;
}

export default function NavItem({
  labelKey,
  href,
  icon: Icon,
  translationNamespace = 'nav',
}: NavItemProps) {
  const pathname = usePathname();
  const locale = pathname?.split('/')[1] || 'en';
  const t = useTranslations(translationNamespace);

  const fullHref = `/${locale}${href}`;
  const isActive = pathname === fullHref || pathname?.startsWith(fullHref + '/');

  return (
    <Link
      href={fullHref}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
        transition-all duration-150 ease-in-out group
        ${isActive
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
      `}
    >
      <Icon
        size={18}
        className={`flex-shrink-0 transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`}
      />
      <span className="truncate">{t(labelKey)}</span>
    </Link>
  );
}
