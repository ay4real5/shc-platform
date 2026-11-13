'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { InspectionOverviewRow, StatusChip } from '@/components/inspection/inspection-ui';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';

type Filter = 'all' | 'gaps' | 'ready';

/**
 * CQC inspection pack (S4-02): the team's staff files at a glance, least ready first. Tick the people an inspector asks
 * about (or everyone) and make a printable pack.
 */
export default function InspectionPage() {
  const { request } = useAuth();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');

  const overview = useQuery({
    queryKey: ['inspection', 'overview'],
    queryFn: async () => (await request<InspectionOverviewRow[]>('/inspection/overview')).data,
  });
  const rows = useMemo(() => overview.data ?? [], [overview.data]);
  const shown = rows.filter((r) => (filter === 'gaps' ? !r.ready : filter === 'ready' ? r.ready : true));
  const ready = rows.filter((r) => r.ready).length;
  const gaps = rows.reduce((n, r) => n + r.counts.missing, 0);
  const attention = rows.reduce((n, r) => n + r.counts.attention, 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.staffId));
  const packHref = (ids: string[]) => `/compliance/inspection/pack?ids=${ids.join(',')}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="CQC inspection pack"
        subtitle="Every staff file checked against Regulation 19 and Schedule 3. Fix gaps before an inspector finds them, and print a pack in one click."
        actions={
          rows.length > 0 && (
            <ButtonLink href={packHref(rows.map((r) => r.staffId).slice(0, 100))} variant="secondary">
              Pack for everyone
            </ButtonLink>
          )
        }
      />
      <ErrorAlert error={overview.error} />

      {overview.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile label="Files in order" value={`${ready} of ${rows.length}`} tone={ready === rows.length ? 'border-l-emerald-500' : 'border-l-brand-700'} />
          <Tile label="Gaps to fix" value={String(gaps)} tone={gaps ? 'border-l-rose-600' : 'border-l-emerald-500'} />
          <Tile label="Need attention soon" value={String(attention)} tone={attention ? 'border-l-amber-500' : 'border-l-emerald-500'} />
        </div>
      )}
      {rows.length > 100 && <Alert tone="info">A pack holds up to 100 people at a time; tick the people you need.</Alert>}

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Show" className="flex gap-1">
            {(
              [
                ['all', 'Everyone'],
                ['gaps', 'With gaps'],
                ['ready', 'In order'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-sm border px-3 py-1.5 text-sm font-semibold ${filter === value ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {picked.size > 0 ? (
            <ButtonLink href={packHref([...picked].slice(0, 100))} variant="accent">
              <ClipboardList aria-hidden className="h-4 w-4" /> Make pack for {picked.size} {picked.size === 1 ? 'person' : 'people'}
            </ButtonLink>
          ) : (
            <p className="text-sm text-slate-600">Tick the people the inspector asked about.</p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-8 py-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Tick everyone shown"
                    checked={allShown}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        for (const r of shown) {
                          if (allShown) next.delete(r.staffId);
                          else next.add(r.staffId);
                        }
                        return next;
                      })
                    }
                    className="h-4 w-4 accent-brand-800"
                  />
                </th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Job role</th>
                <th className="py-2 pr-4 font-medium">File</th>
                <th className="py-2 font-medium">Missing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.staffId} className="align-top">
                  <td className="py-2.5 pr-2">
                    <input type="checkbox" aria-label={`Include ${r.name}`} checked={picked.has(r.staffId)} onChange={() => toggle(r.staffId)} className="h-4 w-4 accent-brand-800" />
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <Link href={packHref([r.staffId])} className="font-medium text-brand-800 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">{disciplineLabel(r.discipline)}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {r.ready && !r.counts.attention ? <StatusChip status="ok">In order</StatusChip> : null}
                      {r.counts.missing > 0 && <StatusChip status="missing">{r.counts.missing} missing</StatusChip>}
                      {r.counts.attention > 0 && <StatusChip status="attention">{r.counts.attention} to watch</StatusChip>}
                      {r.counts.paper > 0 && <StatusChip status="paper">{r.counts.paper} on paper</StatusChip>}
                    </div>
                  </td>
                  <td className="py-2.5 text-slate-700">{r.missing.join(' · ') || '—'}</td>
                </tr>
              ))}
              {overview.data && shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    {rows.length ? 'Nobody matches.' : 'No active staff yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600">
          <strong>On paper</strong> means it was recorded (for example by the spreadsheet import) but the evidence is held outside SHC: have the paper file ready, or
          upload it to their record.
        </p>
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className={`border-l-4 p-4 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-ink">{value}</p>
    </Card>
  );
}
