'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function LanguageToggle() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('header');

  const locale = pathname?.split('/')[1] || 'en';

  const toggleLocale = () => {
    const newLocale = locale === 'en' ? 'fr' : 'en';
    const newPath = pathname?.replace(`/${locale}`, `/${newLocale}`) ?? `/${newLocale}`;
    router.push(newPath);
  };

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors duration-150"
    >
      {t('language')}
    </button>
  );
}
