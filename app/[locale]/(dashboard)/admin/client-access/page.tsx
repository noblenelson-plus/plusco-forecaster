import { useTranslations } from 'next-intl';

export default function ClientAccessPage() {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-2xl">🔑</span>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t('adminSub.clientAccess')}</h1>
      <p className="text-gray-500">{t('pages.comingSoon')}</p>
    </div>
  );
}
