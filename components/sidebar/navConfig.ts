import {
  Users,
  DollarSign,
  TrendingUp,
  FlaskConical,
  LayoutDashboard,
  Settings,
  Package,
  HelpCircle,
  Shield,
  Lock,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItemConfig {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface AdminSubItemConfig {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export const mainNavItems: NavItemConfig[] = [
  { labelKey: 'mediaSpend', href: '/media-spend', icon: DollarSign },
  { labelKey: 'revenue', href: '/revenue', icon: TrendingUp },
  { labelKey: 'lab', href: '/lab', icon: FlaskConical },
  { labelKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'configure', href: '/configure', icon: Settings },
  { labelKey: 'products', href: '/products', icon: Package },
  { labelKey: 'help', href: '/help', icon: HelpCircle },
];

export const adminSubItems: AdminSubItemConfig[] = [
  { labelKey: 'clients', href: '/admin/clients', icon: Users },
  { labelKey: 'rfqLock', href: '/admin/rfq-lock', icon: Lock },
  { labelKey: 'clientAccess', href: '/admin/client-access', icon: UserCheck },
];
