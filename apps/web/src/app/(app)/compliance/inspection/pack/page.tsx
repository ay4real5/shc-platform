'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { InspectionItemRow, StatusChip, type InspectionPack } from '@/components/inspection/inspection-ui';
import { Button, ButtonLink } from '@/components/ui/button';
import { ErrorAlert, formatDate } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel, humanize } from '@/lib/labels';

interface PacksResponse {
  company: string;
  generatedOn: string;
  packs: InspectionPack[];
}

export default function InspectionPackPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense>
      <Pack />
    </Suspense>
  );
}

/**
 * The printable pack (S4-02): a cover sheet listing everyone, then one section per person starting on a new page.
 * "Print / save as PDF" uses the browser's print dialog; the app's top bar and footer are hidden when printing.
 */
function Pack() {
  const { request } = useAuth();
  const ids = (useSearchParams().get('ids') ?? '').split(',').filter(Boolean);
  const packs = useQuery({
    queryKey: ['inspection', 'packs', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => (await request<PacksResponse>(`/inspection/packs?ids=${ids.join(',')}`)).data,
  });
  const data = packs.data;

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ButtonLink href="/compliance/inspection" variant="ghost">
          <ArrowLeft aria-hidden className="h-4 w-4" /> All staff files
        </ButtonLink>
        <Button onClick={() => window.print()} disabled={!data}>
          <Printer aria-hidden className="h-4 w-4" /> Print / save as PDF
        </Button>
      </div>
      {!ids.length && <p className="text-sm text-slate-600">Choose people on the inspection pack page first.</p>}
      <ErrorAlert error={packs.error} />
      {packs.isPending && ids.length > 0 && <p className="text-sm text-slate-600">Putting the pack together…</p>}

      {data && (
        <>
          {/* Cover sheet */}
          <section className="rounded-md border border-slate-200 bg-white p-8 print:rounded-none print:border-0 print:p-0">
            <div className="flex items-center justify-between gap-4 border-b-4 border-accent-500 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Staff files · CQC Regulation 19</p>
                <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{data.company}</h1>
              </div>
              <LogoMark className="h-12 w-12" />
            </div>
            <p className="mt-4 text-sm text-slate-700">
              Prepared {formatDate(data.generatedOn)} from the staff records held in SHC. {data.packs.length} {data.packs.length === 1 ? 'person' : 'people'}.
              Each section covers the Schedule 3 information (identity, DBS, conduct in previous care work, qualifications, employment history and health), plus Right
              to Work and supervision.
            </p>
            <table className="mt-6 w-full text-left text-sm">
              <thead className="border-b border-slate-300 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Job role</th>
                  <th className="py-2 pr-4 font-medium">Started</th>
                  <th className="py-2 font-medium">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.packs.map((p) => (
                  <tr key={p.staffId}>
                    <td className="py-2 pr-4 font-medium text-ink">
                      <a href={`#person-${p.staffId}`} className="hover:underline">
                        {p.name}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{disciplineLabel(p.discipline)}</td>
                    <td className="py-2 pr-4 text-slate-700">{p.hireDate ? formatDate(p.hireDate) : '—'}</td>
                    <td className="py-2">
                      {p.counts.missing ? (
                        <StatusChip status="missing">{p.counts.missing} missing</StatusChip>
                      ) : p.counts.attention ? (
                        <StatusChip status="attention">{p.counts.attention} to watch</StatusChip>
                      ) : (
                        <StatusChip status="ok">In order</StatusChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Key />
          </section>

          {data.packs.map((p) => (
            <section
              key={p.staffId}
              id={`person-${p.staffId}`}
              className="rounded-md border border-slate-200 bg-white p-8 print:mt-0 print:break-before-page print:rounded-none print:border-0 print:p-0"
            >
              <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-brand-800 pb-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-ink">{p.name}</h2>
                  <p className="text-sm text-slate-700">
                    {disciplineLabel(p.discipline)}
                    {p.employeeId && <> · Employee ID {p.employeeId}</>}
                    {p.hireDate && <> · Started {formatDate(p.hireDate)}</>}
                    {!p.isActive && <> · No longer employed</>}
                  </p>
                </div>
                <p className="text-xs text-slate-600">
                  {data.company} · {formatDate(data.generatedOn)}
                </p>
              </header>
              <ul className="mt-4 flex flex-col gap-2">
                {p.items.map((item) => (
                  <InspectionItemRow key={item.key} item={item} />
                ))}
              </ul>
              <div className="mt-5 break-inside-avoid">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Documents on file in SHC</h3>
                {p.documents.length ? (
                  <ul className="mt-1.5 columns-1 text-sm text-slate-700 sm:columns-2">
                    {p.documents.map((d) => (
                      <li key={d.id} className="break-inside-avoid">
                        {d.title} <span className="text-slate-500">({humanize(d.documentType)}, {formatDate(d.createdAt)})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-slate-600">None uploaded.</p>
                )}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function Key() {
  return (
    <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-xs text-slate-600">
      <span className="flex items-center gap-1.5">
        <StatusChip status="ok" /> evidenced in SHC
      </span>
      <span className="flex items-center gap-1.5">
        <StatusChip status="paper" /> recorded; evidence on the paper file
      </span>
      <span className="flex items-center gap-1.5">
        <StatusChip status="attention" /> due soon or waiting for review
      </span>
      <span className="flex items-center gap-1.5">
        <StatusChip status="missing" /> gap to fix
      </span>
    </div>
  );
}
