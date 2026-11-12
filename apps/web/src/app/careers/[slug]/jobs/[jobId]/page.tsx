'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApplicationForm } from '@/components/recruitment/application-form';
import { CareersShell } from '@/components/recruitment/careers-shell';
import { Card } from '@/components/ui/card';
import { DetailList, ErrorAlert, formatDate } from '@/components/ui/data-display';
import { apiRequest } from '@/lib/api';
import { humanize } from '@/lib/labels';
import { formatPay, type PublicJob } from '@/lib/types/recruitment';

/** One open job and its application form. No sign-in. */
export default function CareersJobPage() {
  const { slug, jobId } = useParams<{ slug: string; jobId: string }>();
  const data = useQuery({
    queryKey: ['careers', slug, jobId],
    retry: false,
    queryFn: async () => (await apiRequest<{ company: { name: string }; job: PublicJob }>(`/careers/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}`)).data,
  });
  const job = data.data?.job;

  return (
    <CareersShell company={data.data?.company.name}>
      <Link href={`/careers/${slug}`} className="text-sm text-brand-800 hover:underline">
        ← All jobs
      </Link>
      {data.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      <ErrorAlert error={data.error} />
      {job && (
        <>
          <h1 className="font-display text-[28px] font-extrabold tracking-tight text-ink">{job.title}</h1>
          <Card className="p-5">
            <DetailList
              items={[
                ['Location', job.location],
                ['Contract', humanize(job.employmentType)],
                ['Pay', formatPay(job)],
                ['Hours', job.hours],
                ['Closing date', formatDate(job.closesOn)],
              ]}
            />
          </Card>
          <Card className="p-5">
            <div className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{job.description}</div>
          </Card>
          <h2 className="font-display text-xl font-bold text-ink">Apply for this job</h2>
          <ApplicationForm slug={slug} jobPostingId={job.id} />
        </>
      )}
    </CareersShell>
  );
}
