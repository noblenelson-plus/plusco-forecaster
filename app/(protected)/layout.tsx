
// app/(protected)/layout.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useUserProfile } from "../../lib/hooks/use-user-profile";
import Sidebar from "../../components/_shared/sidebar";
function AccessPendingScreen() {
const { user, signOut } = useAuth();
const { profile } = useUserProfile();
const initials = profile?.displayName
? profile.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
: user?.email?.[0].toUpperCase() ?? "?";
return (
<main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-8">
<div className="w-full max-w-md">
    {/* Logo */}
    <div className="text-center mb-10">
      <span className="text-2xl font-bold text-white tracking-tight">
        PlusCo <span className="text-yellow-400">Forecaster</span>
      </span>
    </div>

    {/* Card */}
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-sm text-center">

      {/* Avatar + name */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-gray-900 text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-white leading-tight">
            {profile?.displayName ?? "—"}
          </p>
          <p className="text-xs text-gray-400">{user?.email}</p>
        </div>
      </div>

      {/* Message */}
      <h1 className="text-lg font-semibold text-white mb-2">
        Access pending
      </h1>
      <p className="text-sm text-gray-400 leading-relaxed mb-2">
        Your account has been created but no clients have been assigned to
        you yet. Please contact:
      </p>
      
        href="mailto:adriana.novoa@pluscompany.com"
        className="inline-block text-sm font-medium text-yellow-400 hover:text-yellow-300 transition-colors mb-8"
      <a>
        adriana.novoa@pluscompany.com
      </a>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-600 text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>

  </div>
</main>
);
}
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
const { user, loading: authLoading } = useAuth();
const { profile, isAdmin, loading: profileLoading } = useUserProfile();
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
// Access gate — user is authenticated but has no clients and is not admin
const hasAccess = isAdmin || (profile?.assignedClients?.length ?? 0) > 0;
if (!hasAccess) {
return <AccessPendingScreen />;
}
return (
<div className="flex min-h-screen bg-gray-50">
  {/* Mobile overlay */}
  {sidebarOpen && (
    <div
      className="fixed inset-0 z-20 bg-black/40 lg:hidden"
      onClick={() => setSidebarOpen(false)}
    />
  )}

  {/*
    Sidebar
    — Mobile  : drawer "fixed" qui glisse depuis la gauche
    — Desktop : sticky, pleine hauteur du viewport (h-screen),
                reste visible pendant que le contenu scrolle
  */}
  <div
    className={`
      fixed top-0 left-0 z-30 h-full
      transform transition-transform duration-200 ease-in-out
      ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:flex-shrink-0
      lg:transform-none lg:transition-none
    `}
  >
    <Sidebar onClose={() => setSidebarOpen(false)} />
  </div>

  {/* Main content */}
  <div className="flex flex-col flex-1 min-w-0">

    {/* Topbar — mobile only, sticky pour rester visible au scroll */}
    <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
      <button
        onClick={() => setSidebarOpen(true)}
        className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Menu size={20} />
      </button>
      <span className="font-bold text-gray-900 tracking-tight">
        PlusCo <span className="text-yellow-400">Forecaster</span>
      </span>
      <div className="w-8" />
    </header>

    {/* Page content — c'est le body qui scrolle, la sidebar reste collée */}
    <main className="flex-1">
      {children}
    </main>

  </div>
</div>
);
}
