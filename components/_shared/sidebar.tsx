// components/_shared/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  DollarSign,
  FlaskConical,
  Upload,
  Briefcase,
  Users,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useUserProfile } from "../../lib/hooks/use-user-profile";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  section?: "main" | "admin";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",    href: "/",               icon: <LayoutDashboard size={18} />, section: "main" },
  { label: "Media Spend",  href: "/media",          icon: <TrendingUp size={18} />,      section: "main" },
  { label: "Revenue",      href: "/revenue",        icon: <DollarSign size={18} />,      section: "main" },
  { label: "Labs",         href: "/labs",           icon: <FlaskConical size={18} />,    section: "main" },
  { label: "Bulk Edits",   href: "/bulk-edits",     icon: <Upload size={18} />,          section: "main" },
  { label: "Clients",      href: "/clients",        icon: <Briefcase size={18} />,       section: "main" },
  { label: "Users",        href: "/admin/users",    icon: <Users size={18} />,           section: "admin", adminOnly: true },
  { label: "Settings",     href: "/admin/settings", icon: <Settings size={18} />,        section: "admin", adminOnly: true },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { profile, isAdmin } = useUserProfile();

  const mainItems = NAV_ITEMS.filter(
    (item) => item.section === "main" && (!item.adminOnly || isAdmin)
  );
  const adminItems = NAV_ITEMS.filter(
    (item) => item.section === "admin" && (!item.adminOnly || isAdmin)
  );

  const initials = profile?.displayName
    ? profile.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? "?";

  return (
    <aside className="h-full w-56 bg-gray-900 flex flex-col">

      {/* Logo + close button (mobile) */}
      <div className="px-5 py-5 border-b border-gray-800 flex items-center justify-between">
        <span className="text-white font-bold text-lg tracking-tight">
          Plusco <span className="text-yellow-400">Forecaster</span>
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">

        {/* Main section */}
        <ul className="space-y-1">
          {mainItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
          ))}
        </ul>

        {/* Admin section */}
        {adminItems.length > 0 && (
          <>
            <p className="px-3 pt-6 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Admin
            </p>
            <ul className="space-y-1">
              {adminItems.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* User block */}
      <div className="px-3 py-4 border-t border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-gray-900 text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {profile?.displayName ?? user?.email}
            </p>
            <p className="text-gray-500 text-xs">
              {profile?.role === "ADMIN" ? "Admin" : "Business Lead"}
            </p>
          </div>
        </div>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// Sub-component for individual nav links
function NavLink({
  item,
  pathname,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  onClose?: () => void;
}) {
  const isActive = pathname === item.href;

  return (
    <li>
      <Link
        href={item.href}
        onClick={onClose}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
          ${isActive
            ? "bg-yellow-400 text-gray-900"
            : "text-gray-400 hover:bg-gray-800 hover:text-white"
          }
        `}
      >
        {item.icon}
        {item.label}
      </Link>
    </li>
  );
}