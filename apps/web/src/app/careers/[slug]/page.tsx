'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CareersShell } from '@/components/recruitment/careers-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert } from '@/components/ui/data-display';
import { apiRequest } from '@/lib/api';
import { humanize } from '@/lib/labels';
import { formatPay, type CareersPage } from '@/lib/types/recruitment';

/** Public list of a company's open jobs. No sign-in. */
export default function CareersListPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = useQuery({ queryKey: ['careers', slug], queryFn: async () => (await apiRequest<CareersPage>(`/careers/${encodeURIComponent(slug)}`)).data, retry: false });

  return (
    <CareersShell company={page.data?.company.name}>
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-tight text-ink">Work with us</h1>
        <p className="mt-1 text-slate-600">
          {page.data ? `${page.data.jobs.length} open ${page.data.jobs.length === 1 ? 'job' : 'jobs'}${page.data.company.town ? ` in and around ${page.data.company.town}` : ''}.` : ' '}
        </p>
      </div>
      {page.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      <ErrorAlert error={page.error} />
      <ul className="flex flex-col gap-4">
        {page.data?.jobs.map((job) => (
          <li key={job.id}>
            <Card className="flex flex-col gap-2 p-5">
              <h2 className="text-lg font-semibold text-ink">
                <Link href={`/careers/${slug}/jobs/${job.id}`} className="hover:underline">
                  {job.title}
                </Link>
              </h2>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" aria-hidden /> {job.location}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-4 w-4" aria-hidden /> {humanize(job.employmentType)}
                </span>
                {formatPay(job) && <span className="font-medium text-slate-800">{formatPay(job)}</span>}
              </p>
              {job.summary && <p className="text-sm text-slate-700">{job.summary}</p>}
              <div>
                <ButtonLink href={`/careers/${slug}/jobs/${job.id}`} variant="secondary">
                  View and apply
                </ButtonLink>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {page.data && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-slate-700">{page.data.jobs.length ? 'Nothing quite right?' : 'No open jobs right now.'} Send us a general application.</p>
          <ButtonLink href={`/careers/${slug}/apply`} variant="accent">
            Apply for any role
          </ButtonLink>
        </Card>
      )}
    </CareersShell>
  );
}
