import {
  Briefcase,
  CalendarDays,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Sparkles,
  MessagesSquare,
  FileText,
  GraduationCap,
  Grid3x3,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type Menu = 'People' | 'Compliance' | 'Admin';

export interface NavItem {
  href: string;
  label: string;
  permission: string | null;
  icon: LucideIcon;
  /** null = straight in the top bar; otherwise inside that drop-down. */
  menu: Menu | null;
}

/** Top-bar entries (S-018); each shows only if the user holds its permission (the API enforces it regardless). */
export const NAVIGATION: readonly NavItem[] = [
  { href: '/', label: 'Dashboard', permission: null, icon: LayoutDashboard, menu: null },
  { href: '/recruitment', label: 'Recruitment', permission: 'recruitment:read', icon: Briefcase, menu: null },
  { href: '/staff', label: 'Staff', permission: 'staff:read', icon: Users, menu: null },
  { href: '/messages', label: 'Messages', permission: 'messages:use', icon: MessageSquare, menu: null },
  { href: '/staff/onboarding', label: 'Onboarding', permission: 'staff:read', icon: ClipboardCheck, menu: 'People' },
  { href: '/staff/credentials', label: 'Checks & expiries', permission: 'staff:read', icon: ShieldCheck, menu: 'People' },
  { href: '/staff/supervisions', label: 'Supervisions', permission: 'staff:read', icon: MessagesSquare, menu: 'People' },
  { href: '/staff/holiday', label: 'Holiday & absence', permission: 'staff:read', icon: CalendarDays, menu: 'People' },
  { href: '/training/matrix', label: 'Training matrix', permission: 'staff:read', icon: Grid3x3, menu: 'People' },
  { href: '/training', label: 'Academy', permission: 'training:manage', icon: GraduationCap, menu: 'People' },
  { href: '/documents', label: 'Documents', permission: 'documents:read', icon: FileText, menu: 'Compliance' },
  { href: '/compliance/inspection', label: 'CQC inspection pack', permission: 'compliance:read', icon: ClipboardList, menu: 'Compliance' },
  { href: '/compliance/ask', label: 'Ask our policies', permission: 'ai:use', icon: Sparkles, menu: 'Compliance' },
  { href: '/compliance', label: 'Compliance', permission: 'compliance:read', icon: ShieldAlert, menu: 'Compliance' },
  { href: '/compliance/audit-log', label: 'Audit log', permission: 'audit_logs:read', icon: ScrollText, menu: 'Compliance' },
  { href: '/users', label: 'Users', permission: 'users:read', icon: UserCog, menu: 'Admin' },
  { href: '/settings/roles', label: 'Roles', permission: 'users:read', icon: KeyRound, menu: 'Admin' },
  { href: '/settings/agency', label: 'Company settings', permission: 'settings:read', icon: Building2, menu: 'Admin' },
];

export const NAV_MENUS: readonly Menu[] = ['People', 'Compliance', 'Admin'];
