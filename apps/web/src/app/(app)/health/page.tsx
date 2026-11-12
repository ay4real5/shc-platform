'use client';

import { HealthForm } from '@/components/staff/health';
import { PageHeader } from '@/components/ui/data-display';

/** The person's own health questionnaire (S2-05). */
export default function HealthPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Health questionnaire" subtitle="A few questions so we can support you at work. About two minutes." />
      <HealthForm />
    </div>
  );
}
