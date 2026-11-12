'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { JobForm } from '@/components/recruitment/job-form';
import { PageHeader } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import type { Job } from '@/lib/types/recruitment';

export default function NewJobPage() {
  const { request } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="Post a job" subtitle="Open jobs appear on your careers page straight away." />
      <JobForm
        submitLabel="Save job"
        onSubmit={async (body) => {
          const { data } = await request<Job>('/recruitment/jobs', { method: 'POST', body });
          await queryClient.invalidateQueries({ queryKey: ['recruitment'] });
          router.push(`/recruitment/jobs/${data.id}`);
        }}
      />
    </div>
  );
}
