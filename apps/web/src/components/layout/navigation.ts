import {
  Briefcase,
  Building2,
  ClipboardCheck,
  GraduationCap,
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

type Group = 'Overview' | 'People' | 'Compliance' | 'Admin';

/** Sidebar entries; each shows only if the user holds its permission (the API enforces it regardless). */
export const NAVIGATION: readonly { href: string; label: string; permission: string | null; icon: LucideIcon; group: Group }[] = [
  { href: '/', label: 'Dashboard', permission: null, icon: LayoutDashboard, group: 'Overview' },
  { href: '/messages', label: 'Messages', permission: 'messages:use', icon: MessageSquare, group: 'Overview' },
  { href: '/recruitment', label: 'Recruitment', permission: 'recruitment:read', icon: Briefcase, group: 'People' },
  { href: '/staff', label: 'Staff', permission: 'staff:read', icon: Users, group: 'People' },
  { href: '/staff/onboarding', label: 'Onboarding', permission: 'staff:read', icon: ClipboardCheck, group: 'People' },
  { href: '/staff/credentials', label: 'Checks & expiries', permission: 'staff:read', icon: ShieldCheck, group: 'People' },
  { href: '/training', label: 'Academy', permission: 'training:manage', icon: GraduationCap, group: 'People' },
  { href: '/compliance', label: 'Compliance', permission: 'compliance:read', icon: ShieldAlert, group: 'Compliance' },
  { href: '/compliance/audit-log', label: 'Audit log', permission: 'audit_logs:read', icon: ScrollText, group: 'Compliance' },
  { href: '/users', label: 'Users', permission: 'users:read', icon: UserCog, group: 'Admin' },
  { href: '/settings/roles', label: 'Roles', permission: 'users:read', icon: KeyRound, group: 'Admin' },
  { href: '/settings/agency', label: 'Company settings', permission: 'settings:read', icon: Building2, group: 'Admin' },
];

export const NAV_GROUPS: readonly Group[] = ['Overview', 'People', 'Compliance', 'Admin'];
