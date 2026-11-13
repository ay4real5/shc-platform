'use client';

import { credentialTypeLabel } from '@alora/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Briefcase, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';

export interface ManagerDashboardData {
  today: string;
  staff: { active: number; ready: number };
  notReady: { total: number; people: { staffId: string; name: string; discipline: string; percent: number; missing: string[] }[] };
  expiring: {
    expired: number;
    within30Days: number;
    items: { credentialId: string; staffId: string; name: string; credentialName: string; credentialType: string; expiryDate: string | null; state: string }[];
  };
  hiring: {
    openJobs: number;
    newApplicationsThisWeek: number;
    byStage: { stage: string; label: string; count: number }[];
    interviewsNext7Days: number;
    waitingOverAWeek: number;
  };
  attention: {
    timeOffToApprove: number;
    supervisionsOverdue: number;
    peopleOverdueSupervision: number;
    recordsAwaitingSignature: number;
    healthToReview: number;
    trainingGaps: number;
    careCertificatesOverdue: number;
  };
}

export function useManagerDashboard(enabled: boolean) {
  const { request } = useAuth();
  return useQuery({
    queryKey: ['dashboard', 'manager'],
    enabled,
    queryFn: async () => (await request<ManagerDashboardData>('/dashboard/manager')).data,
  });
}

function SectionHeader({ title, href, linkText }: { title: string; href: string; linkText: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-base font-bold text-ink">{title}</h2>
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-brand-800 hover:underline">
        {linkText} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The manager's sections of the home page (S3-05). */
export function ManagerDashboard({ data, error }: { data: ManagerDashboardData | undefined; error: unknown }) {
  const { can } = useAuth();
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;
  const a = data.attention;
  const todo = [
    { n: a.timeOffToApprove, text: plural(a.timeOffToApprove, 'holiday request') + ' to approve', href: '/staff/holiday' },
    { n: a.peopleOverdueSupervision, text: `${plural(a.peopleOverdueSupervision, 'person', 'people')} overdue a supervision, appraisal or spot check`, href: '/staff/supervisions' },
    { n: a.healthToReview, text: plural(a.healthToReview, 'health questionnaire') + ' to review', href: '/staff/onboarding' },
    { n: a.careCertificatesOverdue, text: plural(a.careCertificatesOverdue, 'Care Certificate') + ' past the 12 weeks', href: '/training/matrix' },
    { n: a.trainingGaps, text: plural(a.trainingGaps, 'training gap') + ' (missing or expired)', href: '/training/matrix' },
    { n: a.recordsAwaitingSignature, text: plural(a.recordsAwaitingSignature, 'supervision record') + ' not signed by staff yet', href: '/staff/supervisions' },
  ].filter((t) => t.n > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <SectionHeader title="Can't work yet" href="/staff/onboarding" linkText={data.notReady.total > data.notReady.people.length ? `All ${data.notReady.total}` : 'Onboarding'} />
        {data.notReady.total === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 aria-hidden className="h-4 w-4" /> Everyone is ready to work.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {data.notReady.people.map((p) => (
              <li key={p.staffId} className="flex flex-col gap-1 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/staff/${p.staffId}`} className="font-medium text-brand-800 hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-xs text-slate-600">
                    {disciplineLabel(p.discipline)} · {p.percent}% ready
                  </span>
                </div>
                <p className="text-xs text-slate-700">
                  Missing: {p.missing.slice(0, 3).join(', ')}
                  {p.missing.length > 3 ? ` and ${p.missing.length - 3} more` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <SectionHeader title="Expiring in the next 30 days" href="/staff/credentials" linkText="Checks & expiries" />
        {data.expiring.expired + data.expiring.within30Days === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 aria-hidden className="h-4 w-4" /> Nothing expires in the next 30 days.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-700">
              {data.expiring.expired > 0 && <span className="font-semibold text-red-700">{data.expiring.expired} expired</span>}
              {data.expiring.expired > 0 && data.expiring.within30Days > 0 && ' · '}
              {data.expiring.within30Days > 0 && <span>{data.expiring.within30Days} expiring</span>}
            </p>
            <ul className="flex flex-col divide-y divide-slate-100 text-sm">
              {data.expiring.items.map((c) => (
                <li key={c.credentialId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/staff/${c.staffId}#checks`} className="font-medium text-brand-800 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-slate-600"> · {c.credentialType === 'other' ? c.credentialName : credentialTypeLabel(c.credentialType)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-600">
                    {formatDate(c.expiryDate)} <StatusBadge status={c.state} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">Needs your attention</h2>
        {todo.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 aria-hidden className="h-4 w-4" /> Nothing waiting on you.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {todo.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className="flex items-center justify-between gap-2 py-2 text-slate-800 hover:text-brand-800">
                  {t.text} <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {can('recruitment:read') && (
        <Card className="p-5">
          <SectionHeader title="Hiring" href="/recruitment" linkText="Recruitment" />
          <p className="mb-3 flex items-center gap-2 text-sm text-slate-700">
            <Briefcase aria-hidden className="h-4 w-4 text-brand-600" />
            {plural(data.hiring.openJobs, 'job')} open · {data.hiring.newApplicationsThisWeek} new {data.hiring.newApplicationsThisWeek === 1 ? 'application' : 'applications'} this week
          </p>
          <ol className="mb-3 grid grid-cols-4 gap-2 text-center" aria-label="Applicants by stage">
            {data.hiring.byStage.map((s) => (
              <li key={s.stage} className="rounded-xl bg-canvas px-2 py-3">
                <p className="tabular font-display text-2xl font-bold text-ink">{s.count}</p>
                <p className="text-xs text-slate-600">{s.label}</p>
              </li>
            ))}
          </ol>
          <p className="text-sm text-slate-700">
            {plural(data.hiring.interviewsNext7Days, 'interview')} in the next 7 days
            {data.hiring.waitingOverAWeek > 0 && <span className="text-amber-800"> · {data.hiring.waitingOverAWeek} waiting over a week for a next step</span>}
          </p>
        </Card>
      )}
    </div>
  );
}
