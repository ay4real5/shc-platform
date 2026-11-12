'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { BAND_TEXT, type AbsenceSummary } from '@/components/staff/holiday';
import { Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader, formatDate } from '@/components/ui/data-display';
import { SelectField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';

interface Report {
  leaveYear: { start: string; end: string };
  rows: {
    staff: { id: string; name: string; discipline: string };
    holiday: { entitlement: number; taken: number; booked: number; pending: number; remaining: number; daysPerWeekSet: boolean };
    absence: Pick<AbsenceSummary, 'spells' | 'days' | 'bradford' | 'band'>;
  }[];
}

/** Everyone's holiday balance this leave year and sickness over the last 52 weeks (S3-03). */
export default function HolidayReportPage() {
  const { request } = useAuth();
  const [sort, setSort] = useState<'name' | 'remaining' | 'bradford'>('name');
  const report = useQuery({ queryKey: ['holiday', 'report'], queryFn: async () => (await request<Report>('/holiday/report')).data });
  const r = report.data;
  const rows = r
    ? [...r.rows].sort((a, b) => (sort === 'remaining' ? b.holiday.remaining - a.holiday.remaining : sort === 'bradford' ? b.absence.bradford - a.absence.bradford : 0))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Holiday & absence"
        subtitle={r ? `Leave year ${formatDate(r.leaveYear.start)} – ${formatDate(r.leaveYear.end)}. Sickness covers the last 52 weeks.` : 'Holiday balances and sickness.'}
      />
      <Card className="flex flex-col gap-4 p-4">
        <ErrorAlert error={report.error} />
        <SelectField label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-56">
          <option value="name">Name</option>
          <option value="remaining">Most holiday left</option>
          <option value="bradford">Highest Bradford score</option>
        </SelectField>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Staff</th>
                <th className="py-2 pr-3 text-right font-medium">Allowance</th>
                <th className="py-2 pr-3 text-right font-medium">Taken</th>
                <th className="py-2 pr-3 text-right font-medium">Booked</th>
                <th className="py-2 pr-3 text-right font-medium">Pending</th>
                <th className="py-2 pr-6 text-right font-medium">Left</th>
                <th className="py-2 pr-3 text-right font-medium">Sick spells</th>
                <th className="py-2 pr-3 text-right font-medium">Sick days</th>
                <th className="py-2 font-medium">Bradford</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.staff.id}>
                  <td className="py-2 pr-4">
                    <Link href={`/staff/${row.staff.id}#time-off`} className="font-medium text-brand-800 hover:underline">
                      {row.staff.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {disciplineLabel(row.staff.discipline)}
                      {!row.holiday.daysPerWeekSet ? ' · days a week not set' : ''}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right">{row.holiday.entitlement}</td>
                  <td className="py-2 pr-3 text-right">{row.holiday.taken}</td>
                  <td className="py-2 pr-3 text-right">{row.holiday.booked}</td>
                  <td className="py-2 pr-3 text-right">{row.holiday.pending || ''}</td>
                  <td className={`py-2 pr-6 text-right font-semibold ${row.holiday.remaining < 0 ? 'text-red-700' : 'text-slate-900'}`}>{row.holiday.remaining}</td>
                  <td className="py-2 pr-3 text-right">{row.absence.spells || ''}</td>
                  <td className="py-2 pr-3 text-right">{row.absence.days || ''}</td>
                  <td className="py-2">
                    {row.absence.spells > 0 && (
                      <span className={BAND_TEXT[row.absence.band].className}>
                        {row.absence.bradford} <span className="text-xs">({BAND_TEXT[row.absence.band].label})</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {r && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">
                    No active staff yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600">
          Statutory holiday is 5.6 weeks (max 28 days, bank holidays included), pro-rated for joiners. The Bradford score is spells² × days: it flags frequent
          short absences. Use it with your absence policy, not instead of it.
        </p>
      </Card>
    </div>
  );
}
