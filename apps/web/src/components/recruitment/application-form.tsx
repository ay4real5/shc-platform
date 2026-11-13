'use client';

import { RIGHT_TO_WORK_ANSWERS, RIGHT_TO_WORK_LABELS, findHistoryGaps, type HistoryGap } from '@alora/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { ApiError, apiRequest } from '@/lib/api';

interface Entry {
  kind: 'job' | 'gap';
  employer: string;
  jobTitle: string;
  startDate: string;
  endDate: string;
  current: boolean;
  reasonForLeaving: string;
  wasCareRole: boolean;
  explanation: string;
}

interface Referee {
  name: string;
  organisation: string;
  relationship: string;
  email: string;
  phone: string;
  contactBeforeOffer: boolean;
}

const blankJob = (current = false): Entry => ({
  kind: 'job',
  employer: '',
  jobTitle: '',
  startDate: '',
  endDate: '',
  current,
  reasonForLeaving: '',
  wasCareRole: false,
  explanation: '',
});
const blankReferee = (): Referee => ({ name: '', organisation: '', relationship: '', email: '', phone: '', contactBeforeOffer: false });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The public application form (S1-04): contact details, right to work, availability, a full employment history with
 * every gap explained (CQC Schedule 3, checked live with the same rule the API uses), two referees and a declaration.
 */
export function ApplicationForm({ slug, jobPostingId }: { slug: string; jobPostingId?: string }) {
  const [history, setHistory] = useState<Entry[]>([blankJob(true)]);
  const [referees, setReferees] = useState<Referee[]>([blankReferee(), blankReferee()]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const gaps: HistoryGap[] = useMemo(
    () =>
      findHistoryGaps(
        history.filter((h) => h.startDate && (h.current || h.endDate)).map((h) => ({ kind: h.kind, startDate: h.startDate, endDate: h.current ? null : h.endDate })),
        today(),
      ),
    [history],
  );

  const setEntry = (i: number, patch: Partial<Entry>) => setHistory((all) => all.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const setReferee = (i: number, patch: Partial<Referee>) => setReferees((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const explainGap = (gap: HistoryGap) => setHistory((all) => [...all, { ...blankJob(), kind: 'gap', startDate: gap.from, endDate: gap.to }]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (gaps.length) {
      document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    const optional = (key: string) => text(key) || undefined;
    const body = {
      ...(jobPostingId ? { jobPostingId } : {}),
      firstName: text('firstName'),
      lastName: text('lastName'),
      email: text('email'),
      phone: text('phone'),
      addressLine1: optional('addressLine1'),
      town: optional('town'),
      postcode: text('postcode'),
      rightToWork: text('rightToWork'),
      canDrive: form.get('canDrive') === 'on',
      earliestStart: optional('earliestStart'),
      availability: optional('availability'),
      coverNote: optional('coverNote'),
      history: history.map((h) =>
        h.kind === 'gap'
          ? { kind: 'gap', startDate: h.startDate, endDate: h.endDate || null, explanation: h.explanation.trim() }
          : {
              kind: 'job',
              employer: h.employer.trim(),
              jobTitle: h.jobTitle.trim(),
              startDate: h.startDate,
              endDate: h.current ? null : h.endDate || null,
              reasonForLeaving: h.reasonForLeaving.trim() || undefined,
              wasCareRole: h.wasCareRole,
            },
      ),
      referees: referees.map((r) => ({
        name: r.name.trim(),
        organisation: r.organisation.trim() || undefined,
        relationship: r.relationship.trim(),
        email: r.email.trim(),
        phone: r.phone.trim() || undefined,
        contactBeforeOffer: r.contactBeforeOffer,
      })),
      declaration: form.get('declaration') === 'on',
      website: optional('website'),
    };

    setBusy(true);
    setError(null);
    try {
      const { data } = await apiRequest<{ reference: string }>(`/careers/${encodeURIComponent(slug)}/applications`, { method: 'POST', body });
      setDone(data.reference);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError && e.code === 'HISTORY_GAPS')) window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Card className="flex flex-col gap-2 p-6" role="status">
        <h2 className="font-display text-xl font-bold text-ink">Thank you, your application has been sent</h2>
        <p className="text-sm text-slate-700">
          Your reference is <span className="tabular-nums tracking-wide font-semibold">{done}</span>. We will be in touch by email or phone. Please keep an eye on your
          junk folder too.
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate={false}>
      <ErrorAlert error={error} />

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h3 className="text-base font-semibold text-slate-900 sm:col-span-2">About you</h3>
        <Field label="First name" name="firstName" required maxLength={100} autoComplete="given-name" />
        <Field label="Last name" name="lastName" required maxLength={100} autoComplete="family-name" />
        <Field label="Email" name="email" type="email" required maxLength={255} autoComplete="email" />
        <Field label="Mobile number" name="phone" type="tel" required maxLength={20} autoComplete="tel" />
        <Field label="Address" name="addressLine1" maxLength={255} autoComplete="address-line1" />
        <Field label="Town or city" name="town" maxLength={100} autoComplete="address-level2" />
        <Field label="Postcode" name="postcode" required maxLength={10} autoComplete="postal-code" />
        <SelectField label="Your right to work in the UK" name="rightToWork" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {RIGHT_TO_WORK_ANSWERS.map((a) => (
            <option key={a} value={a}>
              {RIGHT_TO_WORK_LABELS[a]}
            </option>
          ))}
        </SelectField>
        <Field label="Earliest start date (optional)" name="earliestStart" type="date" />
        <Field label="When can you work? (optional)" name="availability" maxLength={500} placeholder="e.g. weekdays and every other weekend" />
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" name="canDrive" className="size-4 rounded border-slate-300" />I have a full driving licence and a car I can use for work
        </label>
        <TextAreaField label="Why would you like this job? (optional)" name="coverNote" maxLength={5000} rows={4} className="sm:col-span-2" />
      </Card>

      <Card id="history" className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Employment history</h3>
          <p className="text-sm text-slate-600">
            Start with your current or most recent job and go back to when you left full-time education. Care providers must see a full history, so
            please explain any gaps of more than a month (for example study, caring for family, travelling or looking for work).
          </p>
        </div>
        {history.map((h, i) => (
          <fieldset key={i} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-800">{h.kind === 'gap' ? 'Gap in employment' : `Job ${history.slice(0, i + 1).filter((x) => x.kind === 'job').length}`}</legend>
            {h.kind === 'job' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Employer" value={h.employer} required maxLength={200} onChange={(e) => setEntry(i, { employer: e.target.value })} />
                <Field label="Job title" value={h.jobTitle} required maxLength={150} onChange={(e) => setEntry(i, { jobTitle: e.target.value })} />
                <Field label="Started" type="date" value={h.startDate} required max={today()} onChange={(e) => setEntry(i, { startDate: e.target.value })} />
                {!h.current && <Field label="Left" type="date" value={h.endDate} required max={today()} onChange={(e) => setEntry(i, { endDate: e.target.value })} />}
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={h.current} onChange={(e) => setEntry(i, { current: e.target.checked, endDate: '' })} className="size-4 rounded border-slate-300" />I
                  still work here
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={h.wasCareRole} onChange={(e) => setEntry(i, { wasCareRole: e.target.checked })} className="size-4 rounded border-slate-300" />
                  Work with children or vulnerable adults
                </label>
                {!h.current && (
                  <Field label="Why did you leave?" value={h.reasonForLeaving} maxLength={500} className="sm:col-span-2" onChange={(e) => setEntry(i, { reasonForLeaving: e.target.value })} />
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="From" type="date" value={h.startDate} required max={today()} onChange={(e) => setEntry(i, { startDate: e.target.value })} />
                <Field label="To" type="date" value={h.endDate} required max={today()} onChange={(e) => setEntry(i, { endDate: e.target.value })} />
                <Field label="What were you doing?" value={h.explanation} required maxLength={1000} className="sm:col-span-2" onChange={(e) => setEntry(i, { explanation: e.target.value })} />
              </div>
            )}
            {history.length > 1 && (
              <div>
                <Button type="button" variant="ghost" onClick={() => setHistory((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              </div>
            )}
          </fieldset>
        ))}
        {gaps.length > 0 && (tried || history.length > 1) && (
          <Alert tone="warning">
            <p className="font-medium">Please explain {gaps.length === 1 ? 'this gap' : 'these gaps'}:</p>
            <ul className="mt-2 flex flex-col gap-2">
              {gaps.map((g) => (
                <li key={g.from} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {formatDate(g.from)} to {formatDate(g.to)}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => explainGap(g)}>
                    Explain this gap
                  </Button>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <div>
          <Button type="button" variant="secondary" onClick={() => setHistory((all) => [...all, blankJob()])} disabled={history.length >= 40}>
            <Plus className="h-4 w-4" aria-hidden /> Add a job
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">References</h3>
          <p className="text-sm text-slate-600">Two people who know you through work, one of them your most recent employer. Not family or friends.</p>
        </div>
        {referees.map((r, i) => (
          <fieldset key={i} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold text-slate-800">Referee {i + 1}</legend>
            <Field label="Name" value={r.name} required maxLength={200} onChange={(e) => setReferee(i, { name: e.target.value })} />
            <Field label="Organisation" value={r.organisation} maxLength={200} onChange={(e) => setReferee(i, { organisation: e.target.value })} />
            <Field label="How do they know you?" value={r.relationship} required maxLength={150} placeholder="e.g. my manager at…" onChange={(e) => setReferee(i, { relationship: e.target.value })} />
            <Field label="Email" type="email" value={r.email} required maxLength={255} onChange={(e) => setReferee(i, { email: e.target.value })} />
            <Field label="Phone (optional)" type="tel" value={r.phone} maxLength={20} onChange={(e) => setReferee(i, { phone: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={r.contactBeforeOffer} onChange={(e) => setReferee(i, { contactBeforeOffer: e.target.checked })} className="size-4 rounded border-slate-300" />
              You may contact them before an offer
            </label>
            {referees.length > 2 && (
              <div className="sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setReferees((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              </div>
            )}
          </fieldset>
        ))}
        {referees.length < 4 && (
          <div>
            <Button type="button" variant="secondary" onClick={() => setReferees((all) => [...all, blankReferee()])}>
              <Plus className="h-4 w-4" aria-hidden /> Add another referee
            </Button>
          </div>
        )}
      </Card>

      {/* Spam trap: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="declaration" required className="mt-0.5 size-4 rounded border-slate-300" />
          <span>
            The information I have given is true and complete. I understand the company will use it to consider my application, will contact my
            referees, and will keep it securely in line with UK data protection law.
          </span>
        </label>
        <div className="flex justify-end">
          <Button type="submit" variant="accent" disabled={busy}>
            {busy ? 'Sending…' : 'Send application'}
          </Button>
        </div>
      </Card>
    </form>
  );
}
