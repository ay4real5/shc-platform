'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader, formatDate } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';

type CellState = 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'not_needed';

interface Matrix {
  columns: { type: string; label: string }[];
  rows: {
    staff: { id: string; name: string; discipline: string };
    cells: Record<string, { state: CellState; expiryDate: string | null }>;
    careCertificate: { completed: number; total: number; dueBy: string | null; overdue: boolean } | null;
  }[];
  totals: Record<string, { missing: number; expired: number; expiringSoon: number }>;
}

const CELL: Record<CellState, { label: string; className: string }> = {
  valid: { label: 'In date', className: 'bg-emerald-50 text-emerald-800' },
  expiring_soon: { label: 'Expiring', className: 'bg-amber-50 text-amber-800' },
  expired: { label: 'Expired', className: 'bg-red-50 text-red-800' },
  missing: { label: 'Missing', className: 'bg-red-50 text-red-800' },
  not_needed: { label: '–', className: 'text-slate-400' },
};

const hasGap = (r: Matrix['rows'][number]) => Object.values(r.cells).some((c) => c.state !== 'valid' && c.state !== 'not_needed');

/** Who has which training (S3-02): one row per active member of staff, one column per training their role needs. */
export default function TrainingMatrixPage() {
  const { request } = useAuth();
  const [gapsOnly, setGapsOnly] = useState(false);
  const matrix = useQuery({ queryKey: ['training', 'matrix'], queryFn: async () => (await request<Matrix>('/training/matrix')).data });
  const m = matrix.data;
  const rows = m ? (gapsOnly ? m.rows.filter(hasGap) : m.rows) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Training matrix" subtitle="Everyone's training at a glance: in date, expiring within its warning window, expired or missing. Ready for a CQC inspection." />
      <Card className="flex flex-col gap-4 p-4">
        <ErrorAlert error={matrix.error} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} className="size-4 rounded border-slate-300" />
          Only show people with something to do
        </label>
        {m && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2 pr-4 font-medium uppercase tracking-wide">Staff</th>
                  {m.columns.map((c) => (
                    <th key={c.type} className="px-1 py-2 text-center font-medium">
                      {c.label}
                      <span className="block font-normal text-slate-500">
                        {m.totals[c.type]!.missing + m.totals[c.type]!.expired} to do
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.staff.id}>
                    <td className="py-1.5 pr-4">
                      <Link href={`/staff/${r.staff.id}`} className="font-medium text-brand-800 hover:underline">
                        {r.staff.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{disciplineLabel(r.staff.discipline)}</span>
                    </td>
                    {m.columns.map((c) => {
                      const cell = r.cells[c.type]!;
                      const cc = c.type === 'care_certificate' ? r.careCertificate : null;
                      const style = cc ? { label: `${cc.completed}/${cc.total}`, className: cc.overdue ? 'bg-red-50 text-red-800' : 'bg-sky-50 text-sky-800' } : CELL[cell.state];
                      const title = cc
                        ? `${cc.completed} of ${cc.total} standards${cc.dueBy ? `, ${cc.overdue ? 'was due' : 'due by'} ${formatDate(cc.dueBy)}` : ''}`
                        : cell.expiryDate
                          ? `${CELL[cell.state].label}: expires ${formatDate(cell.expiryDate)}`
                          : CELL[cell.state].label;
                      return (
                        <td key={c.type} className="px-1 py-1.5 text-center">
                          <span title={title} aria-label={`${c.label}: ${title}`} className={`inline-block min-w-16 rounded-md px-1.5 py-1 text-xs font-medium ${style.className}`}>
                            {style.label}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={m.columns.length + 1} className="py-6 text-center text-slate-500">
                      {gapsOnly ? 'Everyone is up to date.' : 'No active staff yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-600">
          Training comes from each person&rsquo;s credentials: add certificates on their staff page, or they pass a course in the Academy. A fraction under Care
          Certificate is standards signed off so far.
        </p>
      </Card>
    </div>
  );
}
