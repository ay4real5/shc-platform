'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader, StatusBadge, formatDate } from '@/components/ui/data-display';
import type { SponsorReportView, VisaView } from '@/components/staff/visa-panel';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';
import { RegionFilter, regionParam, useRegion } from '@/lib/region';

interface Row {
  staffId: string;
  name: string;
  discipline: string;
  region: string | null;
  visa: VisaView;
  openReports: SponsorReportView[];
}

/**
 * Sponsored workers (S5-04, S-031): everyone whose right to work rests on a visa, sponsored first and soonest-ending
 * first, with changes still to report to the Home Office. The list a sponsor licence compliance visit asks for.
 */
export default function SponsorshipPage() {
  const { request } = useAuth();
  const [region] = useRegion();
  const list = useQuery({ queryKey: ['sponsorship', region], queryFn: async () => (await request<Row[]>(`/sponsorship${regionParam(region)}`)).data });
  const rows = list.data ?? [];
  const sponsored = rows.filter((r) => r.visa.sponsored).length;
  const ending = rows.filter((r) => r.visa.state !== 'valid').length;
  const toReport = rows.reduce((n, r) => n + r.openReports.length, 0);
  const overdue = rows.reduce((n, r) => n + r.openReports.filter((x) => x.overdue).length, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sponsored workers"
        subtitle="Visas, Certificates of Sponsorship and the changes you must report to the Home Office within 10 working days."
        actions={<RegionFilter />}
      />
      <ErrorAlert error={list.error} />
      {list.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-600">Sponsored by you</p>
            <p className="mt-2 font-display text-3xl font-bold text-ink">{sponsored}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-600">Visas ending within 90 days</p>
            <p className={`mt-2 font-display text-3xl font-bold ${ending ? 'text-amber-800' : 'text-ink'}`}>{ending}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-medium text-slate-600">Changes to report</p>
            <p className={`mt-2 font-display text-3xl font-bold ${overdue ? 'text-rose-800' : 'text-ink'}`}>
              {toReport}
              {overdue > 0 && <span className="ml-2 text-base font-semibold">({overdue} late)</span>}
            </p>
          </Card>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        {list.data && rows.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nobody has a visa on record. Add visa details on a person&apos;s Checks tab.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Visa</th>
                <th className="px-4 py-3 font-semibold">Ends</th>
                <th className="px-4 py-3 font-semibold">CoS</th>
                <th className="px-4 py-3 font-semibold">To report</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staffId} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/staff/${r.staffId}#checks`} className="font-medium text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-xs text-slate-600">
                      {disciplineLabel(r.discipline)}
                      {r.region && <> · {r.region}</>}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {r.visa.routeLabel}
                    {r.visa.sponsored && <p className="text-xs font-semibold text-brand-800">We sponsor them</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="tabular-nums">{formatDate(r.visa.expiresOn)}</span>
                    {r.visa.state !== 'valid' && (
                      <div className="mt-1">
                        <StatusBadge status={r.visa.state === 'expired' ? 'expired' : 'expiring_soon'} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums tracking-wide">{r.visa.cosReference ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.openReports.length === 0 ? (
                      <span className="text-slate-500">Nothing</span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {r.openReports.map((x) => (
                          <li key={x.id} className={x.overdue ? 'font-medium text-rose-800' : 'text-amber-800'}>
                            {x.eventLabel}: {x.overdue ? 'late, was due' : 'by'} {formatDate(x.dueBy)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Alert tone="info">
        SHC keeps these records and reminds you; it doesn&apos;t give immigration advice. The rules change often (in 2025 the overseas care worker route closed
        to new applicants), so check with your immigration adviser before acting.
      </Alert>
    </div>
  );
}
