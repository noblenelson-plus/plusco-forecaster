import Sidebar from '@/components/sidebar/Sidebar';
import Header from '@/components/header/Header';
import { ClientRFQProvider } from '@/lib/client-rfq-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientRFQProvider>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <Header />
        <main className="ml-64 mt-16 p-6">{children}</main>
      </div>
    </ClientRFQProvider>
  );
}
