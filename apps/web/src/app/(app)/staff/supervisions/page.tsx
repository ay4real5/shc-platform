'use client';

import { SUPERVISION_TYPE_LABELS, SUPERVISION_TYPES } from '@alora/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { DueText, type DueItem } from '@/components/staff/supervisions-panel';
import { Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';

interface Overview {
  today: string;
  rows: { staff: { id: string; name: string; discipline: string }; due: DueItem[]; awaitingSignature: number }[];
}

/** Everyone's next supervision, appraisal and spot check (S3-04). */
export default function SupervisionsPage() {
  const { request } = useAuth();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const overview = useQuery({ queryKey: ['supervisions', 'overview'], queryFn: async () => (await request<Overview>('/supervisions/overview')).data });
  const o = overview.data;
  const overdueCount = o ? o.rows.filter((r) => r.due.some((d) => d.overdue)).length : 0;
  const rows = o ? (overdueOnly ? o.rows.filter((r) => r.due.some((d) => d.overdue)) : o.rows) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Supervisions" subtitle="Supervisions, appraisals and spot checks for everyone: what's overdue, booked and coming up. Book them from each person's page." />
      <Card className="flex flex-col gap-4 p-4">
        <ErrorAlert error={overview.error} />
        {o && (
          <p className="text-sm text-slate-700">
            {overdueCount === 0 ? 'Nobody is overdue.' : `${overdueCount} ${overdueCount === 1 ? 'person is' : 'people are'} overdue for at least one.`}
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="size-4 rounded border-slate-300" />
          Only show people who are overdue
        </label>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Staff</th>
                {SUPERVISION_TYPES.map((t) => (
                  <th key={t} className="py-2 pr-4 font-medium">
                    {SUPERVISION_TYPE_LABELS[t]}
                  </th>
                ))}
                <th className="py-2 font-medium">To sign</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.staff.id}>
                  <td className="py-2 pr-4">
                    <Link href={`/staff/${r.staff.id}#supervisions`} className="font-medium text-brand-800 hover:underline">
                      {r.staff.name}
                    </Link>
                    <span className="block text-xs text-slate-500">{disciplineLabel(r.staff.discipline)}</span>
                  </td>
                  {r.due.map((d) => (
                    <td key={d.type} className="py-2 pr-4">
                      <DueText d={d} />
                    </td>
                  ))}
                  <td className="py-2 text-slate-700">{r.awaitingSignature || ''}</td>
                </tr>
              ))}
              {o && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    {overdueOnly ? 'Nobody is overdue.' : 'No active staff yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
