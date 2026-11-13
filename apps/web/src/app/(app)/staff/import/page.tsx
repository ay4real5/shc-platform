'use client';

import { IMPORT_COLUMNS, importTemplateCsv } from '@alora/shared';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';

interface ImportRow {
  row: number;
  name: string;
  email: string;
  jobRole: string | null;
  status: 'ready' | 'imported' | 'skipped' | 'error';
  problems: string[];
  warnings: string[];
  adds: string[];
  staffId: string | null;
}
interface ImportResult {
  dryRun: boolean;
  fileErrors: string[];
  ignoredColumns: string[];
  counts: { ready: number; imported: number; skipped: number; error: number };
  rows: ImportRow[];
}

const STATUS: Record<ImportRow['status'], { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  imported: { label: 'Imported', className: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  skipped: { label: 'Skipped', className: 'border-slate-300 bg-slate-50 text-slate-700' },
  error: { label: 'Fix this row', className: 'border-rose-300 bg-rose-50 text-rose-800' },
};

/** Staff spreadsheet import (S4-01): template → upload → preview → import. The API does all the checking. */
export default function StaffImportPage() {
  const { request, can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const check = useMutation({
    mutationFn: async (vars: { csv: string; dryRun: boolean }) => (await request<ImportResult>('/staff-import', { method: 'POST', body: vars })).data,
  });
  const result = check.data;

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([`﻿${importTemplateCsv()}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SHC staff import template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function choose(f: File | undefined) {
    check.reset();
    setFileProblem(null);
    setFile(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setFileProblem('Please save the spreadsheet as CSV first: in Excel choose File → Save As → "CSV UTF-8 (Comma delimited)".');
      return;
    }
    if (f.size > 2_000_000) {
      setFileProblem('That file is too big. Upload at most 500 people at a time.');
      return;
    }
    const csv = await f.text();
    setFile({ name: f.name, csv });
    check.mutate({ csv, dryRun: true });
  }

  if (!can('staff:create') || !can('users:create')) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Import staff" />
        <Alert tone="info">Only administrators and registered managers can import staff.</Alert>
      </div>
    );
  }

  const done = result && !result.dryRun;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Import staff"
        subtitle="Bring your existing team into SHC in one go: their logins, staff records, Right to Work, DBS and training."
        actions={
          <ButtonLink href="/staff" variant="secondary">
            Back to staff
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Step number={1} title="Download the template">
          <p>One row per person. Only name, email and job role are required; fill in what you have.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download aria-hidden className="h-4 w-4" /> Download template
            </Button>
            <Button variant="ghost" onClick={() => setShowGuide((v) => !v)} aria-expanded={showGuide}>
              {showGuide ? 'Hide column guide' : 'Column guide'}
            </Button>
          </div>
        </Step>
        <Step number={2} title="Fill it in and save as CSV">
          <p>
            Dates as day/month/year, e.g. 14/03/2022. Delete the sample row. In Excel: <strong>File → Save As → CSV UTF-8</strong>.
          </p>
        </Step>
        <Step number={3} title="Upload and check">
          <p>Nothing is saved until you&apos;ve seen the preview and pressed Import.</p>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Spreadsheet (CSV)" onChange={(e) => void choose(e.target.files?.[0])} />
          <Button className="mt-3" onClick={() => { if (input.current) input.current.value = ''; input.current?.click(); }}>
            <Upload aria-hidden className="h-4 w-4" /> {file ? 'Choose another file' : 'Choose file'}
          </Button>
          {file && (
            <p className="mt-2 flex items-center gap-1.5 text-slate-700">
              <FileSpreadsheet aria-hidden className="h-4 w-4" /> {file.name}
            </p>
          )}
        </Step>
      </div>

      {showGuide && <ColumnGuide />}
      {fileProblem && <Alert>{fileProblem}</Alert>}
      <ErrorAlert error={check.error} />
      {check.isPending && <p className="text-sm text-slate-600">{file && check.variables?.dryRun ? 'Checking every row…' : 'Importing…'}</p>}

      {result && result.fileErrors.length > 0 && (
        <Alert>
          {result.fileErrors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </Alert>
      )}

      {result && !result.fileErrors.length && (
        <Card className="flex flex-col gap-4 p-5">
          {done ? (
            <div className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <CheckCircle2 aria-hidden className="h-5 w-5 text-emerald-600" /> {result.counts.imported} {result.counts.imported === 1 ? 'person' : 'people'} imported
              </h2>
              <p className="text-sm text-slate-700">
                Their checks are on file, marked as done before SHC. Keep the evidence (Right to Work copies, references) on each person&apos;s file. To sign in, staff
                use <strong>Forgot password</strong> on the sign-in page with their email to set their own password.
              </p>
              {result.counts.error > 0 && (
                <p className="text-sm text-rose-800">
                  {result.counts.error} {result.counts.error === 1 ? 'row needs' : 'rows need'} fixing. Fix them in the spreadsheet and upload it again: people already imported are skipped.
                </p>
              )}
              <div className="flex gap-2">
                <ButtonLink href="/staff">See staff</ButtonLink>
                <ButtonLink href="/staff/onboarding" variant="secondary">
                  Check who&apos;s ready
                </ButtonLink>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">Preview</h2>
                <p className="text-sm text-slate-700">
                  <strong>{result.counts.ready}</strong> ready to import
                  {result.counts.skipped > 0 && <>, {result.counts.skipped} already in SHC</>}
                  {result.counts.error > 0 && (
                    <>
                      , <span className="font-semibold text-rose-800">{result.counts.error} to fix</span> (they won&apos;t be imported)
                    </>
                  )}
                  .
                </p>
              </div>
              <Button variant="accent" disabled={!result.counts.ready || check.isPending} onClick={() => file && check.mutate({ csv: file.csv, dryRun: false })}>
                Import {result.counts.ready} {result.counts.ready === 1 ? 'person' : 'people'}
              </Button>
            </div>
          )}
          {result.ignoredColumns.length > 0 && (
            <Alert tone="warning">Columns SHC doesn&apos;t know were ignored: {result.ignoredColumns.join(', ')}.</Alert>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="py-2 pr-3 font-medium">Row</th>
                  <th className="py-2 pr-3 font-medium">Person</th>
                  <th className="py-2 pr-3 font-medium">Job role</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...result.rows]
                  .sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error') || a.row - b.row)
                  .map((r) => (
                    <tr key={r.row} className="align-top">
                      <td className="py-2.5 pr-3 tabular-nums tracking-wide text-slate-600">{r.row}</td>
                      <td className="py-2.5 pr-3">
                        {r.staffId ? (
                          <Link href={`/staff/${r.staffId}`} className="font-medium text-brand-800 hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{r.name || '—'}</span>
                        )}
                        <span className="block text-xs text-slate-600">{r.email}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">{r.jobRole ? disciplineLabel(r.jobRole) : '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                      </td>
                      <td className="py-2.5 text-slate-700">
                        {r.problems.length > 0 && (
                          <ul className={r.status === 'error' ? 'text-rose-800' : 'text-slate-600'}>
                            {r.problems.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        )}
                        {r.warnings.length > 0 && (
                          <ul className="text-amber-800">
                            {r.warnings.map((w) => (
                              <li key={w}>⚠ {w}</li>
                            ))}
                          </ul>
                        )}
                        {r.adds.length > 0 && r.status !== 'error' && <p className="text-slate-600">{r.adds.join(' · ')}</p>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 text-sm text-slate-700">
      <p className="flex items-center gap-2.5 font-display text-lg font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-brand-800 font-sans text-sm text-accent-300">{number}</span>
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

function ColumnGuide() {
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Column guide</h2>
      <p className="mt-1 text-sm text-slate-600">Leave a cell blank if you don&apos;t have it. Training columns come in pairs: the date done and the renewal date.</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {IMPORT_COLUMNS.filter((c) => !c.key.startsWith('cred:') || c.key.endsWith(':date')).map((c) => (
          <div key={c.key}>
            <dt className="font-semibold text-ink">
              {c.key.startsWith('cred:') ? c.header.replace(/ date$/, ' date / expires') : c.header}
              {c.required && <span className="ml-1 text-xs font-semibold uppercase text-rose-700">required</span>}
            </dt>
            <dd className="text-slate-600">{c.key.startsWith('cred:') ? 'Date done, and the renewal date if it has one.' : c.help}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
