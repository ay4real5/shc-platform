'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApplicationForm } from '@/components/recruitment/application-form';
import { CareersShell } from '@/components/recruitment/careers-shell';
import { ErrorAlert } from '@/components/ui/data-display';
import { apiRequest } from '@/lib/api';
import type { CareersPage } from '@/lib/types/recruitment';

/** A general application, not for one advert. No sign-in. */
export default function GeneralApplicationPage() {
  const { slug } = useParams<{ slug: string }>();
  const page = useQuery({ queryKey: ['careers', slug], retry: false, queryFn: async () => (await apiRequest<CareersPage>(`/careers/${encodeURIComponent(slug)}`)).data });

  return (
    <CareersShell company={page.data?.company.name}>
      <Link href={`/careers/${slug}`} className="text-sm text-brand-800 hover:underline">
        ← All jobs
      </Link>
      <h1 className="font-display text-[28px] font-extrabold tracking-tight text-ink">Apply to work with us</h1>
      <ErrorAlert error={page.error} />
      {page.data && <ApplicationForm slug={slug} />}
    </CareersShell>
  );
}
