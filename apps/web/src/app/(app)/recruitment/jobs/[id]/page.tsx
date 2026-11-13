'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { JobForm } from '@/components/recruitment/job-form';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InterviewQuestions } from '@/components/ai/ai-assist';
import { DetailList, ErrorAlert, PageHeader, StatusBadge, formatDate } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel, humanize } from '@/lib/labels';
import { formatPay, type Job } from '@/lib/types/recruitment';

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const job = useQuery({ queryKey: ['recruitment', 'jobs', id], queryFn: async () => (await request<Job>(`/recruitment/jobs/${id}`)).data });
  const setStatus = useMutation({
    mutationFn: (status: string) => request(`/recruitment/jobs/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recruitment'] }),
  });

  if (job.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!job.data) return <ErrorAlert error={job.error} />;
  const j = job.data;
  const manage = can('recruitment:manage');

  if (editing) {
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        <PageHeader title={`Edit: ${j.title}`} />
        <JobForm
          job={j}
          submitLabel="Save changes"
          onSubmit={async (body) => {
            await request(`/recruitment/jobs/${id}`, { method: 'PATCH', body });
            await queryClient.invalidateQueries({ queryKey: ['recruitment'] });
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {j.title} <StatusBadge status={j.status} />
          </span>
        }
        subtitle={`${disciplineLabel(j.discipline)} · ${humanize(j.employmentType)} · ${j.location}`}
        actions={
          manage && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {j.status !== 'open' && (
                <Button disabled={setStatus.isPending} onClick={() => setStatus.mutate('open')}>
                  Publish
                </Button>
              )}
              {j.status === 'open' && (
                <Button variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate('closed')}>
                  Close advert
                </Button>
              )}
            </>
          )
        }
      />
      <ErrorAlert error={setStatus.error} />
      <Card className="p-5">
        <DetailList
          items={[
            ['Pay', formatPay(j)],
            ['Hours', j.hours],
            ['Closing date', formatDate(j.closesOn)],
            ['Published', formatDate(j.publishedAt)],
            ['Applications', String(j.applicationCount)],
            ['Summary', j.summary],
          ]}
        />
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Description</h2>
        <div className="whitespace-pre-line text-sm text-slate-800">{j.description}</div>
      </Card>
      {manage && <InterviewQuestions context={{ jobTitle: j.title, discipline: j.discipline, location: j.location }} />}
      <div>
        <ButtonLink href="/recruitment" variant="secondary">
          Back to recruitment
        </ButtonLink>
      </div>
    </div>
  );
}
