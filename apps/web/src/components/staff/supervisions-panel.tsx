'use client';

import { SUPERVISION_TYPE_LABELS, SUPERVISION_TYPES } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardSignature } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';

export interface DueItem {
  type: string;
  label: string;
  lastHeld: string | null;
  dueOn: string;
  overdue: boolean;
  scheduled: { id: string; scheduledFor: string | null } | null;
}

interface Session {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  scheduledFor: string | null;
  heldOn: string | null;
  supervisor: { id: string; name: string } | null;
  notes: string | null;
  acknowledgedAt: string | null;
  staffComment: string | null;
}

interface Data {
  due: DueItem[];
  sessions: Session[];
  canManage: boolean;
}

const localToday = () => new Date().toLocaleDateString('en-CA');

/** One line per type: overdue, booked, or when it's next due. */
export function DueText({ d }: { d: DueItem }) {
  if (d.scheduled) return <span className="text-sky-800">Booked for {formatDate(d.scheduled.scheduledFor)}</span>;
  if (d.overdue) return <span className="font-semibold text-red-700">Overdue since {formatDate(d.dueOn)}</span>;
  return <span className="text-slate-700">Due {formatDate(d.dueOn)}</span>;
}

/** Supervisions, appraisals and spot checks on the staff page (S3-04). */
export function SupervisionsPanel({ staffId, isSelf }: { staffId: string; isSelf: boolean }) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<null | 'book' | 'record' | { complete: string } | { sign: string }>(null);
  const [open, setOpen] = useState<string | null>(null);
  const data = useQuery({ queryKey: ['staff', staffId, 'supervisions'], queryFn: async () => (await request<Data>(`/staff/${staffId}/supervisions`)).data });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => request(path, { method: 'POST', body: body ?? {} }),
    onSuccess: async () => {
      setMode(null);
      await queryClient.invalidateQueries({ queryKey: ['staff', staffId] });
      await queryClient.invalidateQueries({ queryKey: ['supervisions'] });
    },
  });
  const d = data.data;

  const create = (e: FormEvent<HTMLFormElement>, record: boolean) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act.mutate({
      path: `/staff/${staffId}/supervisions`,
      body: record
        ? { type: f.get('type'), heldOn: f.get('heldOn'), notes: String(f.get('notes') ?? '').trim() }
        : { type: f.get('type'), scheduledFor: f.get('scheduledFor') },
    });
  };

  return (
    <Card id="supervisions" role="region" aria-labelledby={`sup-${staffId}`} className="scroll-mt-6 flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`sup-${staffId}`} className="text-base font-semibold text-slate-900">
          Supervisions and appraisals
        </h2>
        {d?.canManage && mode === null && (
          <span className="flex gap-2">
            <Button variant="secondary" onClick={() => setMode('book')}>
              Book one
            </Button>
            <Button variant="ghost" onClick={() => setMode('record')}>
              Record one already held
            </Button>
          </span>
        )}
      </div>
      <ErrorAlert error={data.error ?? act.error} />
      {d && (
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          {d.due.map((x) => (
            <li key={x.type} className="rounded-xl border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{x.label}</p>
              <p>
                <DueText d={x} />
              </p>
              <p className="text-xs text-slate-500">{x.lastHeld ? `Last held ${formatDate(x.lastHeld)}` : 'None held yet'}</p>
            </li>
          ))}
        </ul>
      )}

      {(mode === 'book' || mode === 'record') && (
        <form onSubmit={(e) => create(e, mode === 'record')} className="grid gap-3 rounded-xl bg-canvas p-4 sm:grid-cols-2">
          <SelectField label="Type" name="type" defaultValue="supervision">
            {SUPERVISION_TYPES.map((t) => (
              <option key={t} value={t}>
                {SUPERVISION_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          {mode === 'book' ? (
            <Field label="Date" name="scheduledFor" type="date" min={localToday()} required />
          ) : (
            <>
              <Field label="Date held" name="heldOn" type="date" max={localToday()} defaultValue={localToday()} required />
              <div className="sm:col-span-2">
                <TextAreaField label="What was discussed, and the actions agreed" name="notes" required minLength={10} maxLength={10000} rows={5} />
              </div>
            </>
          )}
          <p className="text-xs text-slate-600 sm:col-span-2">
            {mode === 'book' ? 'You lead it. They get a notification now and a reminder the day before.' : 'Notes are private: only the person and supervisors can read them. They’re asked to read and sign it.'}
          </p>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={act.isPending}>
              {mode === 'book' ? 'Book' : 'Save record'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {d && d.sessions.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100 text-sm">
          {d.sessions.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto">
                  <span className="font-medium text-slate-900">{s.typeLabel}</span>
                  <span className="text-slate-600">
                    {' '}
                    · {s.status === 'scheduled' ? `booked for ${formatDate(s.scheduledFor)}` : `held ${formatDate(s.heldOn)}`}
                    {s.supervisor ? ` with ${s.supervisor.name}` : ''}
                  </span>
                </span>
                {s.status === 'completed' && (s.acknowledgedAt ? <StatusBadge status="signed" /> : <span className="text-xs text-amber-800">Not signed yet</span>)}
                {s.notes && (
                  <Button variant="ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    {open === s.id ? 'Hide record' : 'Read record'}
                  </Button>
                )}
                {d.canManage && s.status === 'scheduled' && (
                  <>
                    <Button variant="secondary" onClick={() => setMode({ complete: s.id })}>
                      Record it
                    </Button>
                    <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ path: `/supervisions/${s.id}/cancel` })}>
                      Cancel booking
                    </Button>
                  </>
                )}
                {isSelf && s.status === 'completed' && !s.acknowledgedAt && (
                  <Button variant="accent" onClick={() => setMode({ sign: s.id })}>
                    Read and sign
                  </Button>
                )}
              </div>
              {(open === s.id || (typeof mode === 'object' && mode && 'sign' in mode && mode.sign === s.id)) && s.notes && (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="whitespace-pre-line text-slate-800">{s.notes}</p>
                  {s.staffComment && <p className="mt-2 text-slate-700">Their comment: {s.staffComment}</p>}
                </div>
              )}
              {typeof mode === 'object' && mode && 'complete' in mode && mode.complete === s.id && (
                <form
                  className="grid gap-3 rounded-xl bg-canvas p-4 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act.mutate({ path: `/supervisions/${s.id}/complete`, body: { heldOn: f.get('heldOn'), notes: String(f.get('notes') ?? '').trim() } });
                  }}
                >
                  <Field label="Date held" name="heldOn" type="date" max={localToday()} defaultValue={localToday()} required />
                  <div className="sm:col-span-2">
                    <TextAreaField label="What was discussed, and the actions agreed" name="notes" required minLength={10} maxLength={10000} rows={5} />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" disabled={act.isPending}>
                      Save record
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setMode(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
              {typeof mode === 'object' && mode && 'sign' in mode && mode.sign === s.id && (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const comment = String(new FormData(e.currentTarget).get('comment') ?? '').trim();
                    act.mutate({ path: `/supervisions/${s.id}/acknowledge`, body: comment ? { comment } : {} });
                  }}
                >
                  <TextAreaField label="Your comment (optional)" name="comment" maxLength={3000} rows={2} />
                  <div>
                    <Button type="submit" variant="accent" disabled={act.isPending}>
                      I have read this record
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Home page: a supervision record waiting for the person's signature. */
export function SupervisionToSignCard() {
  const { request } = useAuth();
  const list = useQuery({
    queryKey: ['supervisions', 'to-sign'],
    retry: false,
    queryFn: async () => (await request<{ id: string; typeLabel: string; heldOn: string | null; staffId: string }[]>('/supervisions/mine/to-sign')).data,
  });
  const first = list.data?.[0];
  if (!first) return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="flex items-center gap-2 text-sm text-slate-800">
        <ClipboardSignature aria-hidden className="h-5 w-5 text-accent-700" />
        Your {first.typeLabel.toLowerCase()} record from {formatDate(first.heldOn)} is ready to read and sign.
      </p>
      <ButtonLink href={`/staff/${first.staffId}#supervisions`} variant="accent">
        Read it
      </ButtonLink>
    </Card>
  );
}
