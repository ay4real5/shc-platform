'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';

interface Dashboard {
  credentials: { expired: number; expiringWithin30Days: number };
  security: { adminsWithout2fa: number };
}

/** Compliance at a glance: staff checks that have expired or are about to, and account security. */
export default function CompliancePage() {
  const { request, can } = useAuth();
  const d = useQuery({
    queryKey: ['compliance', 'dashboard'],
    enabled: can('compliance:read'),
    queryFn: async () => (await request<Dashboard>('/compliance/dashboard')).data,
  });
  if (!can('compliance:read')) return <PageHeader title="Compliance" subtitle="You don't have access to compliance." />;
  const x = d.data;
  const tiles: [string, number, string, string][] = x
    ? [
        ['Checks expired', x.credentials.expired, 'Right to Work, DBS, training and other checks past their date', '/staff/credentials'],
        ['Checks expiring in 30 days', x.credentials.expiringWithin30Days, 'Renew these before they lapse', '/staff/credentials'],
        ['Admins without two-step sign-in', x.security.adminsWithout2fa, 'Everyone who can see everything must use it', '/users'],
      ]
    : [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Compliance" subtitle="Staff checks and account security that keep you inspection-ready." />
      <ErrorAlert error={d.error} />
      <section aria-label="Compliance summary" className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, value, hint, href]) => (
          <Link key={label} href={href} className="rounded-2xl focus-visible:outline-2 focus-visible:outline-brand-600">
            <Card className={`h-full p-4 transition-shadow hover:shadow-[var(--shadow-lift)] ${value > 0 ? 'border-amber-300' : ''}`}>
              <p className="text-xs text-slate-600">{label}</p>
              <p className={`font-display text-3xl font-bold ${value > 0 ? 'text-amber-800' : 'text-ink'}`}>{value}</p>
              <p className="text-xs text-slate-500">{hint}</p>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
