'use client';

import NavItem from './NavItem';
import AdminSubMenu from './AdminSubMenu';
import ClientDropdown from './ClientDropdown';
import RFQDropdown from './RFQDropdown';
import { mainNavItems } from './navConfig';
import Logo from '../ui/Logo';

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 z-30">
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <Logo />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="pt-2">
          <ClientDropdown />
          <RFQDropdown />
        </div>

        <nav className="mt-2 space-y-1">
          {mainNavItems.map((item) => (
            <NavItem key={item.href} labelKey={item.labelKey} href={item.href} icon={item.icon} />
          ))}
        </nav>
      </div>

      <div className="px-3 py-4 border-t border-gray-200">
        <AdminSubMenu />
      </div>
    </aside>
  );
}
