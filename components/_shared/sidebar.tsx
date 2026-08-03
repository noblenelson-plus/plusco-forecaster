// components/_shared/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Upload,
  Briefcase,
  Users,
  CalendarRange,
  FlaskConical,
  Package,
  DollarSign,
  BookOpen,
  Library,
  FileSpreadsheet,
  ClipboardCheck,
  ShieldCheck,
  Flag,
  LineChart,
  LogOut,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useUserProfile } from "../../lib/hooks/use-user-profile";
import PlusLogo from "./plus-logo";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  section?: "main" | "admin";
  // When true, the item renders indented, as a child of the item above it.
  isSubItem?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",    href: "/",            icon: <LayoutDashboard size={18} />, section: "main" },
  // Forecaster: comparison dashboard, nested under Dashboard (Dashboard stays its own link).
  { label: "Forecaster",   href: "/forecaster",  icon: <LineChart size={16} />,       section: "main", isSubItem: true },
  { label: "Forecast",     href: "/forecast",    icon: <TrendingUp size={18} />,      section: "main" },
  { label: "Flags",        href: "/flags",       icon: <Flag size={18} />,            section: "main" },
  { label: "Milestones",  href: "/progression-recap", icon: <ClipboardCheck size={18} />, section: "main" },
  { label: "Bulk Edits",   href: "/bulk-edits",  icon: <Upload size={18} />,          section: "main", adminOnly: true },
  { label: "Report Center", href: "/report-center", icon: <FileSpreadsheet size={18} />, section: "main", adminOnly: true },
  { label: "Clients",      href: "/clients",     icon: <Briefcase size={18} />,       section: "main" },
  { label: "How to",       href: "/how-to",      icon: <BookOpen size={18} />,        section: "main" },
  { label: "Resources",    href: "/resources",   icon: <Library size={18} />,         section: "main" },
  { label: "Users",        href: "/admin/users", icon: <Users size={18} />,           section: "admin", adminOnly: true },
  { label: "RFQs",         href: "/admin/rfqs",  icon: <CalendarRange size={18} />,   section: "admin", adminOnly: true },
  { label: "LABS",         href: "/admin/labs",  icon: <FlaskConical size={18} />,    section: "admin", adminOnly: true },
  { label: "DISH Products", href: "/admin/products", icon: <Package size={18} />,     section: "admin", adminOnly: true },
  { label: "Currency",     href: "/admin/currency", icon: <DollarSign size={18} />,   section: "admin", adminOnly: true },
  { label: "QA",           href: "/admin/qa",    icon: <ShieldCheck size={18} />,     section: "admin", adminOnly: true },
  { label: "Flags config", href: "/admin/flags", icon: <Flag size={18} />,            section: "admin", adminOnly: true },
];

interface SidebarProps {
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
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
    <aside
      className={`h-full bg-white border-r border-gray-200 flex flex-col transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Signature Plus color stripe */}
      <div className="plus-pattern h-1.5 w-full flex-shrink-0" />

      {/* Logo + collapse / close buttons */}
      <div
        className={`border-b border-gray-100 flex items-center ${
          collapsed ? "flex-col gap-3 px-2 py-5" : "justify-between gap-2 px-4 py-5"
        }`}
      >
        {collapsed ? (
          <PlusLogo size={28} className="flex-shrink-0" />
        ) : (
          <span className="flex items-center gap-2.5 min-w-0">
            <PlusLogo size={32} className="flex-shrink-0" />
            <span className="min-w-0 leading-none">
              <span className="block text-[15px] font-bold tracking-tight text-gray-900 lowercase">
                plus company
              </span>
              <span className="mt-1 inline-block rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                Forecaster
              </span>
            </span>
          </span>
        )}

        {/* Collapse toggle (desktop only) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors flex-shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}

        {/* Close button (mobile) */}
        {onClose && !collapsed && (
          <button
            onClick={onClose}
            className="lg:hidden text-gray-400 hover:text-gray-900 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 py-4 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>

        {/* Main section */}
        <ul className="space-y-1">
          {mainItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} collapsed={collapsed} />
          ))}
        </ul>

        {/* Admin section */}
        {adminItems.length > 0 && (
          <>
            {collapsed ? (
              <div className="my-3 border-t border-gray-100" />
            ) : (
              <p className="px-3 pt-6 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Admin
              </p>
            )}
            <ul className="space-y-1">
              {adminItems.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} collapsed={collapsed} />
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* User block */}
      <div className={`py-4 border-t border-gray-100 ${collapsed ? "px-2" : "px-3"}`}>
        <div
          className={`flex items-center mb-1 ${
            collapsed ? "justify-center py-2" : "gap-3 px-3 py-2"
          }`}
          title={collapsed ? profile?.displayName ?? user?.email ?? undefined : undefined}
        >
          <div className="w-8 h-8 bg-yellow-400 flex items-center justify-center text-gray-900 text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-gray-900 text-sm font-medium truncate">
                {profile?.displayName ?? user?.email}
              </p>
              <p className="text-gray-400 text-xs">
                {profile?.role === "ADMIN" ? "Admin" : "Business Lead"}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={`w-full flex items-center py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          }`}
        >
          <LogOut size={18} />
          {!collapsed && "Sign out"}
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
  collapsed = false,
}: {
  item: NavItem;
  pathname: string;
  onClose?: () => void;
  collapsed?: boolean;
}) {
  const isActive = pathname === item.href;

  // Sub-items get extra left padding so they read as nested under the item above.
  // Indentation only applies in the expanded state; collapsed shows icons only.
  const paddingClass = collapsed
    ? "justify-center px-0"
    : item.isSubItem
    ? "gap-3 pl-9 pr-3"
    : "gap-3 px-3";

  return (
    <li>
      <Link
        href={item.href}
        onClick={onClose}
        title={collapsed ? item.label : undefined}
        className={`
          flex items-center py-2.5 rounded-lg text-sm font-medium transition-colors
          ${paddingClass}
          ${isActive
            ? "bg-yellow-400 text-gray-900 font-semibold"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          }
        `}
      >
        {item.icon}
        {!collapsed && item.label}
      </Link>
    </li>
  );
}