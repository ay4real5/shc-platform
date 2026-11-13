'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert, formatDate } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';

export interface CareCertificate {
  needed: boolean;
  startedOn: string | null;
  dueBy: string | null;
  overdue: boolean;
  completed: number;
  total: number;
  awarded: { credentialId: string; issueDate: string | null } | null;
  standards: { number: number; title: string; completedOn: string | null; signedOffBy: { id: string; name: string } | null; notes: string | null }[];
}

const localToday = () => new Date().toLocaleDateString('en-CA');

/** Care Certificate progress on the staff page (S3-02): 16 standards, each signed off by an assessor. */
export function CareCertificatePanel({ staffId, isSelf }: { staffId: string; isSelf: boolean }) {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const data = useQuery({
    queryKey: ['staff', staffId, 'care-certificate'],
    queryFn: async () => (await request<CareCertificate>(`/staff/${staffId}/care-certificate`)).data,
  });
  const action = useMutation({
    mutationFn: ({ standard, method, body }: { standard: number; method: 'PUT' | 'DELETE'; body?: unknown }) =>
      request(`/staff/${staffId}/care-certificate/${standard}`, { method, body }),
    onSuccess: async () => {
      setOpen(null);
      await queryClient.invalidateQueries({ queryKey: ['staff', staffId] });
    },
  });
  const c = data.data;
  if (!c || (!c.needed && !c.awarded && c.completed === 0)) return data.error ? <ErrorAlert error={data.error} /> : null;
  const assessor = can('training:manage') && !isSelf;
  const percent = Math.round((c.completed / c.total) * 100);
  const showList = assessor || showAll;

  return (
    <Card role="region" aria-labelledby={`cc-${staffId}`} className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`cc-${staffId}`} className="text-base font-semibold text-slate-900">
          Care Certificate
        </h2>
        {!assessor && c.completed > 0 && (
          <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Hide standards' : 'Show standards'}
          </Button>
        )}
      </div>
      <ErrorAlert error={action.error} />
      {c.awarded ? (
        <p className="text-sm text-emerald-800">
          <CheckCircle2 aria-hidden className="mr-1 inline h-4 w-4" />
          Care Certificate on file{c.awarded.issueDate ? `, awarded ${formatDate(c.awarded.issueDate)}` : ''}.
        </p>
      ) : (
        <>
          <div>
            <p className="mb-1 text-sm text-slate-800">
              {c.completed} of {c.total} standards signed off
              {c.dueBy && <span className={c.overdue ? 'font-semibold text-red-700' : 'text-slate-600'}> · {c.overdue ? 'overdue, was due' : 'due by'} {formatDate(c.dueBy)}</span>}
            </p>
            <div className="h-2 overflow-hidden rounded-sm bg-slate-100" role="progressbar" aria-label="Care Certificate progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-sm bg-brand-600" style={{ width: `${percent}%` }} />
            </div>
          </div>
          {!c.startedOn && <p className="text-xs text-slate-600">Add a start date to the staff record to see when it&rsquo;s due (12 weeks after starting).</p>}
        </>
      )}
      {showList && (
        <ol className="flex flex-col divide-y divide-slate-100 text-sm">
          {c.standards.map((s) => (
            <li key={s.number} className="flex flex-col gap-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {s.completedOn ? <CheckCircle2 aria-hidden className="h-4 w-4 text-emerald-700" /> : <Circle aria-hidden className="h-4 w-4 text-slate-400" />}
                <span className="mr-auto text-slate-900">
                  {s.number}. {s.title}
                </span>
                {s.completedOn && (
                  <span className="text-xs text-slate-600">
                    {formatDate(s.completedOn)}
                    {s.signedOffBy ? ` · ${s.signedOffBy.name}` : ''}
                  </span>
                )}
                {assessor && !c.awarded && !s.completedOn && open !== s.number && (
                  <Button variant="secondary" onClick={() => setOpen(s.number)} aria-label={`Sign off standard ${s.number}`}>
                    Sign off
                  </Button>
                )}
                {assessor && !c.awarded && s.completedOn && (
                  <Button variant="ghost" disabled={action.isPending} aria-label={`Undo standard ${s.number}`} onClick={() => action.mutate({ standard: s.number, method: 'DELETE' })}>
                    Undo
                  </Button>
                )}
              </div>
              {open === s.number && (
                <form
                  className="flex flex-wrap items-end gap-2 pl-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const notes = String(form.get('notes') ?? '').trim();
                    action.mutate({ standard: s.number, method: 'PUT', body: { completedOn: String(form.get('completedOn')), ...(notes ? { notes } : {}) } });
                  }}
                >
                  <label className="flex flex-col gap-1 text-xs text-slate-700">
                    Completed on
                    <input name="completedOn" type="date" required max={localToday()} defaultValue={localToday()} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                  </label>
                  <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-700">
                    How it was assessed (optional)
                    <input name="notes" maxLength={1000} placeholder="Observed in practice, workbook…" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                  </label>
                  <Button type="submit" disabled={action.isPending}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                    Cancel
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}
      {assessor && !c.awarded && <p className="text-xs text-slate-600">When all {c.total} are signed off, the Care Certificate is recorded and the onboarding item ticks.</p>}
    </Card>
  );
}
