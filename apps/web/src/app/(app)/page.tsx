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

/** Stat card accents (S-018): a coloured rule on the left and a plain icon. */
const TONES = {
  brand: { icon: 'text-brand-600', bar: 'border-l-brand-700' },
  accent: { icon: 'text-accent-700', bar: 'border-l-accent-500' },
  amber: { icon: 'text-amber-700', bar: 'border-l-amber-500' },
  sky: { icon: 'text-sky-700', bar: 'border-l-sky-600' },
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
    <Card className={`flex h-full items-start justify-between gap-4 border-l-4 p-5 transition-shadow hover:shadow-[var(--shadow-lift)] ${TONES[tone].bar}`}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">{label}</p>
        {loading ? (
          <span aria-hidden className="skeleton mt-3 block h-8 w-16" />
        ) : (
          <p className="tabular mt-2 font-display text-4xl font-semibold text-ink" aria-live="polite">
            {value ?? '—'}
          </p>
        )}
      </div>
      <Icon aria-hidden className={`h-6 w-6 shrink-0 ${TONES[tone].icon}`} />
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500">
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
    'inline-flex items-center gap-2 border border-white/30 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-accent-400 hover:text-accent-200 focus-visible:outline-2 focus-visible:outline-accent-400';

  const manager = useManagerDashboard(can('staff:read'));
  const m = manager.data;
  const unread = useQuery({
    queryKey: ['dashboard', 'unread'],
    queryFn: async () => (await request<{ unread: number }>('/notifications/unread-count')).data.unread,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-hero rounded-md p-6 text-white md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">
          {new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold md:text-[40px] md:leading-tight">
          {greeting}, {user?.firstName}
        </h1>
        <p className="mt-2 max-w-xl text-brand-100">Who is ready to work, what is expiring, and what needs your attention first.</p>
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
            <StatCard label="Ready to work" value={m?.staff.ready} loading={manager.isLoading} href="/staff/onboarding" icon={CheckCircle2} tone="sky" />
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
        {!can('staff:read') && <StatCard label="Unread notifications" value={unread.data} loading={unread.isLoading} icon={Bell} tone="sky" />}
      </div>
      {can('staff:read') && <ManagerDashboard data={m} error={manager.error} />}
    </div>
  );
}
