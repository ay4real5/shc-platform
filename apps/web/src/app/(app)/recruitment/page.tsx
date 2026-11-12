'use client';

import { APPLICATION_STAGE_LABELS, APPLICATION_STAGES } from '@alora/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader, Pager, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';
import type { ApplicationSummary, Job } from '@/lib/types/recruitment';

/** Recruitment home: job adverts and the applications coming in. */
export default function RecruitmentPage() {
  const { request, can } = useAuth();
  const [stage, setStage] = useState('');
  const [jobId, setJobId] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const jobs = useQuery({ queryKey: ['recruitment', 'jobs'], queryFn: async () => (await request<Job[]>('/recruitment/jobs?limit=100')).data });
  const company = useQuery({
    queryKey: ['agency'],
    enabled: can('settings:read'),
    queryFn: async () => (await request<{ careersSlug: string | null }>('/agency')).data,
  });
  const applications = useQuery({
    queryKey: ['recruitment', 'applications', { stage, jobId, debounced, page }],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (stage) params.set('stage', stage);
      if (jobId) params.set('jobPostingId', jobId);
      if (debounced) params.set('search', debounced);
      return request<ApplicationSummary[]>(`/recruitment/applications?${params}`);
    },
  });

  const slug = company.data?.careersSlug;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recruitment"
        subtitle="Your job adverts and everyone who has applied."
        actions={
          <>
            {slug && (
              <ButtonLink href={`/careers/${slug}`} target="_blank" variant="secondary">
                <ExternalLink className="h-4 w-4" aria-hidden /> Careers page
              </ButtonLink>
            )}
            {can('recruitment:manage') && <ButtonLink href="/recruitment/jobs/new">Post a job</ButtonLink>}
          </>
        }
      />
      {company.data && !slug && (
        <Alert tone="info">
          Your careers page is not switched on yet. Choose its address in{' '}
          <Link href="/settings/agency" className="font-medium underline">
            Company settings
          </Link>
          .
        </Alert>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold text-slate-900">Job adverts</h2>
        <ErrorAlert error={jobs.error} />
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="py-2 pr-4 font-medium">Job</th>
              <th className="py-2 pr-4 font-medium">Location</th>
              <th className="py-2 pr-4 font-medium">Applications</th>
              <th className="py-2 pr-4 font-medium">Closes</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.data?.map((j) => (
              <tr key={j.id}>
                <td className="py-2 pr-4">
                  <Link href={`/recruitment/jobs/${j.id}`} className="font-medium text-brand-800 hover:underline">
                    {j.title}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-slate-700">{j.location}</td>
                <td className="py-2 pr-4 text-slate-700">{j.applicationCount}</td>
                <td className="py-2 pr-4 text-slate-700">{formatDate(j.closesOn) || '—'}</td>
                <td className="py-2">
                  <StatusBadge status={j.status} />
                </td>
              </tr>
            ))}
            {jobs.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No job adverts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-base font-semibold text-slate-900">Applications</h2>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Search" type="search" className="w-full max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or reference" />
          <SelectField label="Job" value={jobId} onChange={(e) => { setJobId(e.target.value); setPage(1); }}>
            <option value="">All jobs</option>
            {jobs.data?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </SelectField>
          <SelectField label="Stage" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
            <option value="">All stages</option>
            {APPLICATION_STAGES.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STAGE_LABELS[s]}
              </option>
            ))}
          </SelectField>
        </div>
        <ErrorAlert error={applications.error} />
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="py-2 pr-4 font-medium">Applicant</th>
              <th className="py-2 pr-4 font-medium">Job</th>
              <th className="py-2 pr-4 font-medium">Applied</th>
              <th className="py-2 pr-4 font-medium">Reference</th>
              <th className="py-2 font-medium">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {applications.data?.data.map((a) => (
              <tr key={a.id}>
                <td className="py-2 pr-4">
                  <Link href={`/recruitment/applications/${a.id}`} className="font-medium text-brand-800 hover:underline">
                    {a.firstName} {a.lastName}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-slate-700">{a.job?.title ?? 'General application'}</td>
                <td className="py-2 pr-4 text-slate-700">{formatDate(a.createdAt)}</td>
                <td className="py-2 pr-4 font-mono text-slate-700">{a.reference}</td>
                <td className="py-2">
                  <StatusBadge status={a.stage} />
                </td>
              </tr>
            ))}
            {applications.data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No applications match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {applications.data?.meta && (
          <Pager page={applications.data.meta.page} limit={applications.data.meta.limit} total={applications.data.meta.total} onPage={setPage} />
        )}
      </Card>
    </div>
  );
}
