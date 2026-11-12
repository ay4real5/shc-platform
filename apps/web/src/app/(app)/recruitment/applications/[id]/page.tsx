'use client';

import { RIGHT_TO_WORK_LABELS, type RightToWorkAnswer } from '@alora/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DetailList, ErrorAlert, PageHeader, StatusBadge, formatDate } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import type { ApplicationDetail } from '@/lib/types/recruitment';

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const { request } = useAuth();
  const app = useQuery({
    queryKey: ['recruitment', 'applications', id],
    queryFn: async () => (await request<ApplicationDetail>(`/recruitment/applications/${id}`)).data,
  });

  if (app.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!app.data) return <ErrorAlert error={app.error} />;
  const a = app.data;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {a.firstName} {a.lastName} <StatusBadge status={a.stage} />
          </span>
        }
        subtitle={`${a.job?.title ?? 'General application'} · applied ${formatDate(a.createdAt)} · ref ${a.reference}`}
      />
      <Card className="p-5">
        <DetailList
          items={[
            ['Email', <a key="e" href={`mailto:${a.email}`} className="text-brand-800 underline">{a.email}</a>],
            ['Phone', <a key="p" href={`tel:${a.phone.replace(/\s/g, '')}`} className="text-brand-800 underline">{a.phone}</a>],
            ['Address', [a.addressLine1, a.town, a.postcode].filter(Boolean).join(', ')],
            ['Right to work (their answer)', RIGHT_TO_WORK_LABELS[a.rightToWork as RightToWorkAnswer] ?? a.rightToWork],
            ['Drives', a.canDrive ? 'Yes' : 'No'],
            ['Earliest start', formatDate(a.earliestStart)],
            ['Availability', a.availability],
          ]}
        />
      </Card>
      {a.coverNote && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Why they want the job</h2>
          <p className="whitespace-pre-line text-sm text-slate-800">{a.coverNote}</p>
        </Card>
      )}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Employment history</h2>
        <ol className="flex flex-col gap-3">
          {a.history.map((h, i) => (
            <li key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {h.kind === 'gap' ? 'Gap' : `${h.jobTitle} at ${h.employer}`}
                {h.wasCareRole && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">care role</span>}
              </p>
              <p className="text-slate-600">
                {formatDate(h.startDate)} to {h.endDate ? formatDate(h.endDate) : 'now'}
              </p>
              {h.reasonForLeaving && <p className="mt-1 text-slate-700">Reason for leaving: {h.reasonForLeaving}</p>}
              {h.explanation && <p className="mt-1 text-slate-700">{h.explanation}</p>}
            </li>
          ))}
        </ol>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Referees</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {a.referees.map((r, i) => (
            <li key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">{r.name}</p>
              <p className="text-slate-600">{[r.relationship, r.organisation].filter(Boolean).join(' · ')}</p>
              <p className="text-slate-700">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
              <p className="text-xs text-slate-500">{r.contactBeforeOffer ? 'Can be contacted before an offer' : 'Contact only after an offer'}</p>
            </li>
          ))}
        </ul>
      </Card>
      <div>
        <ButtonLink href="/recruitment" variant="secondary">
          Back to recruitment
        </ButtonLink>
      </div>
    </div>
  );
}
