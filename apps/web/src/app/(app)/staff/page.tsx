'use client';

import { DISCIPLINES } from '@alora/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader, Pager, StatusBadge } from '@/components/ui/data-display';
import { SelectField } from '@/components/ui/form-controls';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel, humanize } from '@/lib/labels';
import type { StaffSummary } from '@/lib/types/people';

export default function StaffPage() {
  const { request, can } = useAuth();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [active, setActive] = useState('true');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Readiness per person (same checklist as each record's Onboarding card), shown as a bar in the list.
  const readiness = useQuery({
    queryKey: ['staff', 'onboarding-overview'],
    queryFn: async () => (await request<{ staffId: string; percent: number; ready: boolean }[]>('/staff/onboarding')).data,
  });
  const ready = new Map((readiness.data ?? []).map((r) => [r.staffId, r]));

  const staff = useQuery({
    queryKey: ['staff', { debounced, discipline, active, page }],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (debounced) params.set('search', debounced);
      if (discipline) params.set('discipline', discipline);
      if (active) params.set('isActive', active);
      return request<StaffSummary[]>(`/staff?${params}`);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        subtitle="Care and support workers, office staff: job roles, checks, availability and holidays."
        actions={
          <>
            <ButtonLink href="/staff/onboarding" variant="secondary">
              Onboarding
            </ButtonLink>
            <ButtonLink href="/staff/credentials" variant="secondary">
              Credentials needing attention
            </ButtonLink>
            {can('staff:create') && can('users:create') && (
              <ButtonLink href="/staff/import" variant="secondary">
                Import from spreadsheet
              </ButtonLink>
            )}
            {can('staff:create') && <ButtonLink href="/staff/new">Add staff profile</ButtonLink>}
          </>
        }
      />
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field
            label="Search"
            type="search"
            className="w-full max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email or employee ID"
          />
          <SelectField label="Job role" value={discipline} onChange={(e) => { setDiscipline(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {disciplineLabel(d)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Status" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
            <option value="true">Active</option>
            <option value="false">Former</option>
            <option value="">All</option>
          </SelectField>
        </div>
        <ErrorAlert error={staff.error} />
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Job role</th>
              <th className="py-2 pr-4 font-medium">Employee ID</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Ready to work</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.data?.data.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-3">
                    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-brand-900 text-xs font-semibold text-accent-300">
                      {s.firstName[0]}
                      {s.lastName[0]}
                    </span>
                    <Link href={`/staff/${s.id}`} className="font-medium text-brand-800 hover:underline">
                      {s.lastName}, {s.firstName}
                    </Link>
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-700">{disciplineLabel(s.discipline)}</td>
                <td className="py-2 pr-4 tabular-nums tracking-wide text-slate-700">{s.employeeId ?? '—'}</td>
                <td className="py-2 pr-4 text-slate-700">{humanize(s.employmentType)}</td>
                <td className="py-2 pr-4">
                  {ready.get(s.id) ? (
                    <span className="flex items-center gap-2" title={ready.get(s.id)!.ready ? 'Ready to work' : 'Not ready yet'}>
                      <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-sm bg-slate-200">
                        <span className={`block h-full ${ready.get(s.id)!.ready ? 'bg-emerald-500' : 'bg-accent-500'}`} style={{ width: `${ready.get(s.id)!.percent}%` }} />
                      </span>
                      <span className={`text-xs font-semibold ${ready.get(s.id)!.ready ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {ready.get(s.id)!.ready ? 'Ready' : `${ready.get(s.id)!.percent}%`}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2">
                  <StatusBadge status={s.isActive ? 'active' : 'inactive'} />
                </td>
              </tr>
            ))}
            {staff.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  No staff match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {staff.data?.meta && (
          <Pager page={staff.data.meta.page} limit={staff.data.meta.limit} total={staff.data.meta.total} onPage={setPage} />
        )}
      </Card>
    </div>
  );
}
