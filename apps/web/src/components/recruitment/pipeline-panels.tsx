'use client';

import {
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  DISCIPLINES,
  EMPLOYMENT_TYPES,
  INTERVIEW_MODE_LABELS,
  INTERVIEW_MODES,
  canMoveStage,
  type InterviewMode,
} from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel, humanize } from '@/lib/labels';
import type { UserView } from '@/lib/types/people';
import type { ApplicationDetail } from '@/lib/types/recruitment';

interface TimelineEntry {
  id: string;
  kind: string;
  fromStage: string | null;
  toStage: string | null;
  text: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

interface Interview {
  id: string;
  startsAt: string;
  durationMinutes: number;
  mode: string;
  location: string | null;
  interviewer: { id: string; name: string } | null;
  status: string;
  score: number | null;
  outcome: string | null;
  notes: string | null;
}

interface Timeline {
  events: TimelineEntry[];
  interviews: Interview[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function useTimeline(applicationId: string) {
  const { request } = useAuth();
  return useQuery({
    queryKey: ['recruitment', 'applications', applicationId, 'timeline'],
    queryFn: async () => (await request<Timeline>(`/recruitment/applications/${applicationId}/timeline`)).data,
  });
}

function useRefresh(applicationId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'applications', applicationId] }),
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'applications'] }),
    ]);
}

/** Where the application is, and the next steps: move stage, or hire. */
export function StagePanel({ app }: { app: ApplicationDetail }) {
  const { request, can } = useAuth();
  const refresh = useRefresh(app.id);
  const [target, setTarget] = useState('');
  const [hiring, setHiring] = useState(false);
  const [hired, setHired] = useState<{ staffProfileId: string; welcomeEmailSent: boolean } | null>(null);
  const move = useMutation({
    mutationFn: (body: Record<string, unknown>) => request<{ emailSent: boolean }>(`/recruitment/applications/${app.id}/stage`, { method: 'POST', body }),
    onSuccess: async () => {
      setTarget('');
      await refresh();
    },
  });
  const hire = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request<{ staffProfileId: string; welcomeEmailSent: boolean }>(`/recruitment/applications/${app.id}/hire`, { method: 'POST', body }),
    onSuccess: async ({ data }) => {
      setHired(data);
      setHiring(false);
      await refresh();
    },
  });

  if (!can('recruitment:manage')) return null;
  const options = APPLICATION_STAGES.filter((s) => canMoveStage(app.stage, s));
  const canHire = can('staff:create') && !['hired', 'rejected', 'withdrawn'].includes(app.stage);

  const submitMove = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    move.mutate({
      stage: target,
      note: String(form.get('note') ?? '').trim() || undefined,
      notifyApplicant: form.get('notifyApplicant') === 'on',
    });
  };

  const submitHire = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    hire.mutate({
      discipline: text('discipline') || undefined,
      employmentType: text('employmentType') || undefined,
      startDate: text('startDate') || undefined,
      ...(text('hourlyRate') ? { hourlyRate: Number(text('hourlyRate')) } : {}),
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Next step</h2>
        <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Stages">
          {(['applied', 'screened', 'interview', 'offer', 'hired'] as const).map((s) => (
            <li key={s} className={`rounded-full px-2.5 py-1 ${app.stage === s ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {APPLICATION_STAGE_LABELS[s]}
            </li>
          ))}
        </ol>
      </div>

      {hired && (
        <Alert tone="info">
          Hired. Their login and staff record are ready, and onboarding has started.{' '}
          {hired.welcomeEmailSent ? 'We emailed them a link to choose their password.' : "Email isn't set up yet, so give them a starting password in Users."}{' '}
          <Link href={`/staff/${hired.staffProfileId}`} className="font-medium underline">
            Open their staff record
          </Link>
        </Alert>
      )}

      {app.stage !== 'hired' && (
        <form onSubmit={submitMove} className="flex flex-wrap items-end gap-3">
          <SelectField label="Move to" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STAGE_LABELS[s]}
              </option>
            ))}
          </SelectField>
          <Field label="Note (optional)" name="note" maxLength={1000} className="min-w-56 flex-1" />
          {target === 'rejected' && (
            <label className="mb-2.5 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="notifyApplicant" defaultChecked className="size-4 rounded border-slate-300" />
              Email them a polite &ldquo;not this time&rdquo;
            </label>
          )}
          <Button type="submit" variant="secondary" disabled={!target || move.isPending}>
            Move
          </Button>
          {canHire && !hiring && (
            <Button type="button" variant="accent" onClick={() => setHiring(true)}>
              Hire
            </Button>
          )}
        </form>
      )}
      <ErrorAlert error={move.error} />

      {hiring && (
        <form onSubmit={submitHire} className="grid gap-3 rounded-xl border border-accent-200 bg-accent-50/40 p-4 sm:grid-cols-2">
          <p className="text-sm text-slate-700 sm:col-span-2">
            Hiring creates {app.firstName}&rsquo;s login and staff record, and emails them a link to set their password.
          </p>
          <SelectField label="Job role" name="discipline" defaultValue="">
            <option value="">As advertised</option>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {disciplineLabel(d)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Contract" name="employmentType" defaultValue="">
            <option value="">As advertised</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </SelectField>
          <Field label="Start date" name="startDate" type="date" />
          {can('pay:read') && <Field label="Hourly rate (£)" name="hourlyRate" type="number" step="0.01" min={0} />}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="accent" disabled={hire.isPending}>
              {hire.isPending ? 'Hiring…' : `Hire ${app.firstName}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setHiring(false)}>
              Cancel
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorAlert error={hire.error} />
          </div>
        </form>
      )}
    </Card>
  );
}

/** Interviews: book one (optionally emailing the invite), then record how it went. */
export function InterviewsPanel({ app }: { app: ApplicationDetail }) {
  const { request, can } = useAuth();
  const refresh = useRefresh(app.id);
  const timeline = useTimeline(app.id);
  const [booking, setBooking] = useState(false);
  const users = useQuery({
    queryKey: ['users', 'interviewers'],
    enabled: can('users:read'),
    queryFn: async () => (await request<UserView[]>('/users?limit=100&isActive=true')).data,
  });
  const book = useMutation({
    mutationFn: (body: Record<string, unknown>) => request(`/recruitment/applications/${app.id}/interviews`, { method: 'POST', body }),
    onSuccess: async () => {
      setBooking(false);
      await refresh();
    },
  });
  const manage = can('recruitment:manage');
  const open = !['hired', 'rejected', 'withdrawn'].includes(app.stage);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    book.mutate({
      startsAt: new Date(`${text('date')}T${text('time')}`).toISOString(),
      durationMinutes: Number(text('durationMinutes') || 30),
      mode: text('mode'),
      location: text('location') || undefined,
      interviewerId: text('interviewerId') || undefined,
      notifyApplicant: form.get('notifyApplicant') === 'on',
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Interviews</h2>
        {manage && open && !booking && (
          <Button variant="secondary" onClick={() => setBooking(true)}>
            Book an interview
          </Button>
        )}
      </div>
      {booking && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
          <Field label="Date" name="date" type="date" required />
          <Field label="Time" name="time" type="time" required />
          <Field label="Length (minutes)" name="durationMinutes" type="number" min={10} max={240} defaultValue={30} />
          <SelectField label="How" name="mode" defaultValue="in_person">
            {INTERVIEW_MODES.map((m) => (
              <option key={m} value={m}>
                {INTERVIEW_MODE_LABELS[m]}
              </option>
            ))}
          </SelectField>
          <Field label="Where / link / number" name="location" maxLength={500} className="sm:col-span-2" />
          {users.data && (
            <SelectField label="Interviewer" name="interviewerId" defaultValue="">
              <option value="">Not set</option>
              {users.data.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </SelectField>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" name="notifyApplicant" defaultChecked className="size-4 rounded border-slate-300" />
            Email {app.firstName} the invitation
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" disabled={book.isPending}>
              Book
            </Button>
            <Button type="button" variant="ghost" onClick={() => setBooking(false)}>
              Cancel
            </Button>
          </div>
          <div className="sm:col-span-3">
            <ErrorAlert error={book.error} />
          </div>
        </form>
      )}
      {timeline.data?.interviews.length === 0 && !booking && <p className="text-sm text-slate-500">No interviews yet.</p>}
      <ul className="flex flex-col gap-3">
        {timeline.data?.interviews.map((i) => (
          <InterviewItem key={i.id} interview={i} applicationId={app.id} editable={manage} />
        ))}
      </ul>
    </Card>
  );
}

function InterviewItem({ interview: i, applicationId, editable }: { interview: Interview; applicationId: string; editable: boolean }) {
  const { request } = useAuth();
  const refresh = useRefresh(applicationId);
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => request(`/recruitment/interviews/${i.id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    save.mutate({
      status: text('status'),
      score: text('score') ? Number(text('score')) : null,
      outcome: text('outcome') || null,
      notes: text('notes'),
    });
  };

  return (
    <li className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-900">
          {when(i.startsAt)} · {INTERVIEW_MODE_LABELS[i.mode as InterviewMode] ?? i.mode} · {i.durationMinutes} min
        </p>
        <StatusBadge status={i.status} />
      </div>
      <p className="text-slate-600">
        {[i.location, i.interviewer && `with ${i.interviewer.name}`].filter(Boolean).join(' · ') || '—'}
      </p>
      {(i.score !== null || i.outcome || i.notes) && (
        <p className="mt-1 text-slate-800">
          {i.score !== null && <>Score {i.score}/5 · </>}
          {i.outcome && <>{i.outcome === 'pass' ? 'Passed' : 'Not passed'} · </>}
          {i.notes}
        </p>
      )}
      {editable && !editing && (
        <Button variant="ghost" className="mt-1" onClick={() => setEditing(true)}>
          Record how it went
        </Button>
      )}
      {editing && (
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-3">
          <SelectField label="Status" name="status" defaultValue={i.status === 'scheduled' ? 'completed' : i.status}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="no_show">Didn&rsquo;t attend</option>
            <option value="cancelled">Cancelled</option>
          </SelectField>
          <SelectField label="Score" name="score" defaultValue={i.score === null ? '' : String(i.score)}>
            <option value="">Not scored</option>
            <option value="5">5 Excellent</option>
            <option value="4">4 Good</option>
            <option value="3">3 OK</option>
            <option value="2">2 Weak</option>
            <option value="1">1 Poor</option>
          </SelectField>
          <SelectField label="Outcome" name="outcome" defaultValue={i.outcome ?? ''}>
            <option value="">Not decided</option>
            <option value="pass">Pass</option>
            <option value="fail">Not passed</option>
          </SelectField>
          <TextAreaField label="Notes" name="notes" defaultValue={i.notes ?? ''} maxLength={10000} className="sm:col-span-3" />
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <div className="sm:col-span-3">
            <ErrorAlert error={save.error} />
          </div>
        </form>
      )}
    </li>
  );
}

/** Everything that has happened to the application, newest first, with a box to add a note. */
export function TimelinePanel({ app }: { app: ApplicationDetail }) {
  const { request, can } = useAuth();
  const refresh = useRefresh(app.id);
  const timeline = useTimeline(app.id);
  const [text, setText] = useState('');
  const add = useMutation({
    mutationFn: () => request(`/recruitment/applications/${app.id}/notes`, { method: 'POST', body: { text } }),
    onSuccess: async () => {
      setText('');
      await refresh();
    },
  });

  const describe = (e: TimelineEntry) => {
    if (e.kind === 'stage') return `Moved to ${APPLICATION_STAGE_LABELS[e.toStage as keyof typeof APPLICATION_STAGE_LABELS] ?? e.toStage}${e.text ? `: ${e.text}` : ''}`;
    if (e.kind === 'note') return e.text;
    return e.text;
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-base font-semibold text-slate-900">Timeline</h2>
      {can('recruitment:manage') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) add.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <TextAreaField label="Add a note" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} rows={2} />
          <div>
            <Button type="submit" variant="secondary" disabled={!text.trim() || add.isPending}>
              Add note
            </Button>
          </div>
          <ErrorAlert error={add.error} />
        </form>
      )}
      <ol className="flex flex-col gap-2 text-sm">
        {timeline.data?.events.map((e) => (
          <li key={e.id} className="flex flex-col border-l-2 border-brand-200 pl-3">
            <span className="text-slate-900">{describe(e)}</span>
            <span className="text-xs text-slate-500">
              {when(e.createdAt)}
              {e.actor ? ` · ${e.actor.name}` : ''}
            </span>
          </li>
        ))}
        <li className="flex flex-col border-l-2 border-brand-200 pl-3">
          <span className="text-slate-900">Applied{app.job ? ` for ${app.job.title}` : ''}</span>
          <span className="text-xs text-slate-500">{when(app.createdAt)}</span>
        </li>
      </ol>
    </Card>
  );
}
