'use client';

import { HEALTH_OUTCOME_LABELS, HEALTH_OUTCOMES, HEALTH_QUESTIONS, HEALTH_VACCINES } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartPulse } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';

interface HealthAnswers {
  answers: Record<string, { answer: 'yes' | 'no'; details?: string }>;
  vaccines: Record<string, boolean>;
}

interface HealthStatus {
  status: 'none' | 'submitted' | 'cleared' | 'referred';
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
}

interface HealthDetail extends HealthStatus {
  answers: HealthAnswers | null;
  outcome: string | null;
  outcomeLabel: string | null;
  note: string | null;
}

const STATUS_TEXT: Record<HealthStatus['status'], string> = {
  none: 'Not filled in yet',
  submitted: 'Filled in, waiting for a manager’s review',
  cleared: 'Reviewed: fit for the role',
  referred: 'Referred to occupational health',
};
const BADGE: Record<HealthStatus['status'], string> = { none: 'pending', submitted: 'submitted', cleared: 'verified', referred: 'exception' };

function useMyHealth(enabled = true) {
  const { request } = useAuth();
  return useQuery({ queryKey: ['health', 'mine'], enabled, retry: false, queryFn: async () => (await request<HealthDetail>('/staff/me/health')).data });
}

/** Home page: a nudge to fill in the questionnaire (staff with a profile who haven't yet). */
export function HealthPromptCard() {
  const mine = useMyHealth();
  if (mine.data?.status !== 'none') return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="flex items-center gap-2 text-sm text-slate-800">
        <HeartPulse aria-hidden className="h-5 w-5 text-accent-600" /> Please fill in your health questionnaire before you start.
      </p>
      <ButtonLink href="/health" variant="accent">
        Fill it in
      </ButtonLink>
    </Card>
  );
}

/** The person's own questionnaire. */
export function HealthForm() {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const mine = useMyHealth();
  const [yes, setYes] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) => request('/staff/me/health', { method: 'PUT', body }),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['health'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });

  if (mine.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (mine.error) return <ErrorAlert error={mine.error} />;
  const current = mine.data!;

  if (current.status !== 'none' && !editing) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-slate-800">
          <StatusBadge status={BADGE[current.status]} /> {STATUS_TEXT[current.status]}. Sent {formatDate(current.submittedAt)}.
        </p>
        {current.note && <p className="text-sm text-slate-700">Note from your manager: {current.note}</p>}
        <div>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Something has changed: update my answers
          </Button>
        </div>
      </Card>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const answers: Record<string, { answer: string; details?: string }> = {};
    for (const q of HEALTH_QUESTIONS) {
      const answer = String(form.get(q.key) ?? '');
      answers[q.key] = answer === 'yes' ? { answer, details: String(form.get(`${q.key}_details`) ?? '').trim() } : { answer };
    }
    const vaccines = Object.fromEntries(HEALTH_VACCINES.map((v) => [v.key, form.get(`vaccine_${v.key}`) === 'on']));
    submit.mutate({ answers, vaccines, declaration: form.get('declaration') === 'on' });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <ErrorAlert error={submit.error} />
      <Alert tone="info">
        Your answers are private: only managers who need to see them can, to agree any support you need. Having a health condition doesn&rsquo;t stop you
        working with us.
      </Alert>
      <Card className="flex flex-col gap-5 p-5">
        {HEALTH_QUESTIONS.map((q) => (
          <fieldset key={q.key} className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-800">{q.text}</legend>
            <div className="flex gap-4 text-sm">
              {(['no', 'yes'] as const).map((a) => (
                <label key={a} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={q.key}
                    value={a}
                    required
                    defaultChecked={current.answers?.answers[q.key]?.answer === a}
                    onChange={() => setYes((y) => ({ ...y, [q.key]: a === 'yes' }))}
                  />
                  {a === 'yes' ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
            {(yes[q.key] ?? current.answers?.answers[q.key]?.answer === 'yes') && (
              <TextAreaField label="Please tell us a little more" name={`${q.key}_details`} required maxLength={2000} rows={2} defaultValue={current.answers?.answers[q.key]?.details ?? ''} />
            )}
          </fieldset>
        ))}
      </Card>
      <Card className="flex flex-col gap-2 p-5">
        <p className="text-sm font-medium text-slate-800">Vaccinations you&rsquo;ve had (optional)</p>
        {HEALTH_VACCINES.map((v) => (
          <label key={v.key} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name={`vaccine_${v.key}`} defaultChecked={current.answers?.vaccines[v.key] ?? false} className="size-4 rounded border-slate-300" /> {v.text}
          </label>
        ))}
      </Card>
      <Card className="flex flex-col gap-3 p-5">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="declaration" required className="mt-0.5 size-4 rounded border-slate-300" />
          <span>My answers are true and complete. I&rsquo;ll tell my manager if anything changes.</span>
        </label>
        <div>
          <Button type="submit" variant="accent" disabled={submit.isPending}>
            {submit.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Card>
    </form>
  );
}

/** Staff page: status for the office; answers and the review for managers with health:read. */
export function HealthPanel({ staffId, isSelf }: { staffId: string; isSelf: boolean }) {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const [show, setShow] = useState(false);
  const status = useQuery({ queryKey: ['staff', staffId, 'health-status'], queryFn: async () => (await request<HealthStatus>(`/staff/${staffId}/health/status`)).data });
  const detail = useQuery({ queryKey: ['staff', staffId, 'health'], enabled: show, queryFn: async () => (await request<HealthDetail>(`/staff/${staffId}/health`)).data });
  const review = useMutation({
    mutationFn: (body: Record<string, unknown>) => request(`/staff/${staffId}/health/review`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', staffId] }),
  });
  const s = status.data;
  const manager = can('health:read') && !isSelf;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Health questionnaire</h2>
        {manager && s && s.status !== 'none' && (
          <Button variant="secondary" onClick={() => setShow((v) => !v)}>
            {show ? 'Hide answers' : 'View answers'}
          </Button>
        )}
      </div>
      <ErrorAlert error={status.error ?? detail.error} />
      {s && (
        <p className="text-sm text-slate-800">
          <StatusBadge status={BADGE[s.status]} /> {STATUS_TEXT[s.status]}
          {s.submittedAt ? ` · sent ${formatDate(s.submittedAt)}` : ''}
          {s.reviewedAt ? ` · reviewed ${formatDate(s.reviewedAt)}${s.reviewedBy ? ` by ${s.reviewedBy.name}` : ''}` : ''}
        </p>
      )}
      {s?.status === 'none' && <p className="text-sm text-slate-600">They fill it in themselves after signing in. Only managers can read the answers.</p>}
      {show && detail.data?.answers && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 text-sm">
          <p className="text-xs text-slate-500">Special category health data. Viewing is recorded in the audit log.</p>
          <ul className="flex flex-col gap-2">
            {HEALTH_QUESTIONS.map((q) => {
              const a = detail.data!.answers!.answers[q.key];
              return (
                <li key={q.key}>
                  <span className="text-slate-700">{q.text}</span>{' '}
                  <span className={a?.answer === 'yes' ? 'font-semibold text-amber-800' : 'text-slate-900'}>{a?.answer === 'yes' ? 'Yes' : 'No'}</span>
                  {a?.details && <span className="block text-slate-800">{a.details}</span>}
                </li>
              );
            })}
          </ul>
          <p className="text-slate-700">
            Vaccinations: {HEALTH_VACCINES.filter((v) => detail.data!.answers!.vaccines[v.key]).map((v) => v.text).join(', ') || 'none given'}
          </p>
          {detail.data.outcomeLabel && (
            <p className="text-slate-800">
              Outcome: {detail.data.outcomeLabel}
              {detail.data.note ? `. ${detail.data.note}` : ''}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              review.mutate({ outcome: String(form.get('outcome')), note: String(form.get('note') ?? '').trim() || undefined });
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <SelectField label="Your review" name="outcome" defaultValue={detail.data.outcome ?? 'fit'}>
              {HEALTH_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {HEALTH_OUTCOME_LABELS[o]}
                </option>
              ))}
            </SelectField>
            <TextAreaField label="Adjustments agreed / note (private)" name="note" maxLength={3000} rows={2} defaultValue={detail.data.note ?? ''} />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={review.isPending}>
                Save review
              </Button>
              <ErrorAlert error={review.error} />
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
