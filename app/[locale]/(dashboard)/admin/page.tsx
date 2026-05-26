import { useTranslations } from 'next-intl';

export default function AdminPage() {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-2xl">🛡️</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t('nav.admin')}</h1>
      <p className="text-gray-500 max-w-xl">{t('pages.adminDescription')}</p>
    </div>
  );
}
