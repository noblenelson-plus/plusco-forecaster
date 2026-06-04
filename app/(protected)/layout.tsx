// app/(protected)/layout.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useUserProfile } from "../../lib/hooks/use-user-profile";
import Sidebar from "../../components/_shared/sidebar";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { loading: profileLoading } = useUserProfile();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth/login");
    }
  }, [user, authLoading, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 tracking-wide">Loading...</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <div
        className={`
          fixed top-0 left-0 z-30 h-full
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:relative lg:translate-x-0 lg:flex lg:flex-shrink-0
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Topbar — mobile only */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Menu size={20} />
          </button>
          <span className="font-bold text-gray-900 tracking-tight">
            Plusco <span className="text-yellow-400">Forecaster</span>
          </span>
          {/* Spacer to center the title */}
          <div className="w-8" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>

      </div>
    </div>
  );
}