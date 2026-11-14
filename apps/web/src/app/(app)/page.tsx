'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Bell, CheckCircle2, ClipboardCheck, GraduationCap, ShieldAlert, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { ManagerDashboard, useManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { ToSignCard } from '@/components/documents/signing';
import { HealthPromptCard } from '@/components/staff/health';
import { HolidayBalanceCard } from '@/components/staff/holiday';
import { SupervisionToSignCard } from '@/components/staff/supervisions-panel';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAgencyToday } from '@/lib/use-agency-today';

/** Stat card colours (S-025): the icon sits in a soft tinted badge. */
const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  accent: 'bg-accent-50 text-accent-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
} as const;

const noSubscribe = () => () => {};
/** "Good morning" by the viewer's clock; plain "Welcome" while rendering on the server (no hydration mismatch). */
function useGreeting(): string {
  const hour = useSyncExternalStore(noSubscribe, () => new Date().getHours(), () => -1);
  if (hour < 0) return 'Welcome';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({
  label,
  value,
  href,
  loading,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  href?: string;
  loading: boolean;
  icon: LucideIcon;
  tone: keyof typeof TONES;
}) {
  const content = (
    <Card className="flex h-full flex-col gap-4 p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <span aria-hidden className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        {loading ? (
          <span aria-hidden className="skeleton block h-9 w-16" />
        ) : (
          <p className="tabular font-display text-4xl font-extrabold tracking-tight text-ink" aria-live="polite">
            {value ?? '—'}
          </p>
        )}
        <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
      {content}
    </Link>
  ) : (
    content
  );
}

export default function DashboardPage() {
  const { user, can, request } = useAuth();
  const today = useAgencyToday();
  const greeting = useGreeting();
  const chip =
    'inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-white';

  const manager = useManagerDashboard(can('staff:read'));
  const m = manager.data;
  const unread = useQuery({
    queryKey: ['dashboard', 'unread'],
    queryFn: async () => (await request<{ unread: number }>('/notifications/unread-count')).data.unread,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-hero rounded-2xl p-6 text-white shadow-[var(--shadow-glow)] md:p-10">
        <p className="text-sm font-medium text-brand-100">
          {new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold md:text-[42px] md:leading-tight">
          {greeting}, {user?.firstName}
        </h1>
        <p className="mt-2 max-w-xl text-lg text-white/90">Who is ready to work, what is expiring, and what needs your attention first.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {can('staff:create') && (
            <Link href="/staff/new" className={chip}>
              <UserPlus aria-hidden className="h-4 w-4" /> Add staff member
            </Link>
          )}
          {can('staff:read') && (
            <Link href="/staff/onboarding" className={chip}>
              <ClipboardCheck aria-hidden className="h-4 w-4" /> Onboarding
            </Link>
          )}
          {can('training:manage') && (
            <Link href="/training" className={chip}>
              <GraduationCap aria-hidden className="h-4 w-4" /> Academy
            </Link>
          )}
        </div>
      </div>
      <ToSignCard />
      <HealthPromptCard />
      <SupervisionToSignCard />
      <HolidayBalanceCard />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can('staff:read') && (
          <>
            <StatCard label="Active staff" value={m?.staff.active} loading={manager.isLoading} href="/staff" icon={Users} tone="brand" />
            <StatCard label="Ready to work" value={m?.staff.ready} loading={manager.isLoading} href="/staff/onboarding" icon={CheckCircle2} tone="emerald" />
            <StatCard label="Can't work yet" value={m?.notReady.total} loading={manager.isLoading} href="/staff/onboarding" icon={ClipboardCheck} tone="accent" />
            <StatCard
              label="Checks expired or expiring (30 days)"
              value={m ? m.expiring.expired + m.expiring.within30Days : undefined}
              loading={manager.isLoading}
              href="/staff/credentials"
              icon={ShieldAlert}
              tone="amber"
            />
          </>
        )}
        {!can('staff:read') && <StatCard label="Unread notifications" value={unread.data} loading={unread.isLoading} icon={Bell} tone="brand" />}
      </div>
      {can('staff:read') && <ManagerDashboard data={m} error={manager.error} />}
    </div>
  );
}
