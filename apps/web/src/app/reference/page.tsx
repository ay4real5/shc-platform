'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { CareersShell } from '@/components/recruitment/careers-shell';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { apiRequest } from '@/lib/api';

/** The token travels in the URL fragment (#token=…), which browsers never send to a server. */
const readToken = () => /(?:^#|&)token=([A-Za-z0-9_-]+)/.exec(window.location.hash)?.[1] ?? '';
const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

interface Request {
  candidateName: string;
  company: string;
  refereeName: string;
  status: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** A referee answers a reference request (S2-03). No sign-in: the one-time link is the key. */
export default function ReferencePage() {
  const token = useSyncExternalStore(subscribe, readToken, () => '');
  const [concern, setConcern] = useState(false);
  const [done, setDone] = useState<'received' | 'declined' | null>(null);
  const info = useQuery({
    queryKey: ['reference', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => (await apiRequest<Request>('/references/view', { method: 'POST', body: { token } })).data,
  });
  const respond = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest('/references/respond', { method: 'POST', body: { ...body, token } }),
    onSuccess: (_d, body) => {
      setDone(body.declined ? 'declined' : 'received');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    respond.mutate({
      refereeName: text('refereeName'),
      refereeJobTitle: text('refereeJobTitle'),
      organisation: text('organisation'),
      employedFrom: text('employedFrom'),
      employedTo: text('employedTo') || undefined,
      candidateJobTitle: text('candidateJobTitle'),
      reasonForLeaving: text('reasonForLeaving') || undefined,
      reliability: Number(text('reliability')),
      attitude: Number(text('attitude')),
      disciplinary: text('disciplinary'),
      safeguardingConcerns: text('safeguardingConcerns'),
      concernDetails: text('concernDetails') || undefined,
      wouldReemploy: text('wouldReemploy'),
      suitableForCare: text('suitableForCare'),
      comments: text('comments') || undefined,
      declaration: form.get('declaration') === 'on',
    });
  };
  const onConcern = (e: React.ChangeEvent<HTMLFormElement>) => {
    const form = new FormData(e.currentTarget);
    setConcern(form.get('disciplinary') === 'yes' || form.get('safeguardingConcerns') === 'yes');
  };

  const r = info.data;
  return (
    <CareersShell company={r?.company}>
      <h1 className="font-display text-[28px] font-extrabold tracking-tight text-ink">Reference request</h1>
      {!token && <Alert>This page needs the link from the reference email. Please open the link again.</Alert>}
      {info.isLoading && token && <p className="text-sm text-slate-500">Loading…</p>}
      <ErrorAlert error={info.error ?? respond.error} />

      {done && (
        <Card className="p-6" role="status">
          <h2 className="font-display text-xl font-bold text-ink">Thank you</h2>
          <p className="mt-1 text-sm text-slate-700">
            {done === 'received' ? 'Your reference has been sent. The company may phone you to confirm it.' : 'We have let the company know you can’t give a reference.'}
          </p>
        </Card>
      )}

      {r && r.status !== 'sent' && !done && <Alert tone="info">This reference has already been answered. Thank you.</Alert>}

      {r && r.status === 'sent' && !done && (
        <>
          <p className="text-slate-700">
            Hello {r.refereeName}. <strong>{r.candidateName}</strong> has applied to work in care with <strong>{r.company}</strong> and gave your name as a
            referee. It takes about five minutes.
          </p>
          <form onSubmit={submit} onChange={onConcern} className="flex flex-col gap-6">
            <Card className="grid gap-4 p-5 sm:grid-cols-2">
              <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">About you</h2>
              <Field label="Your name" name="refereeName" required maxLength={200} defaultValue={r.refereeName} autoComplete="name" />
              <Field label="Your job title" name="refereeJobTitle" required maxLength={150} autoComplete="organization-title" />
              <Field label="Organisation" name="organisation" required maxLength={200} autoComplete="organization" className="sm:col-span-2" />
            </Card>
            <Card className="grid gap-4 p-5 sm:grid-cols-2">
              <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">About {r.candidateName}</h2>
              <Field label="They worked with you from" name="employedFrom" type="date" required max={today()} />
              <Field label="Until (leave blank if they still do)" name="employedTo" type="date" max={today()} />
              <Field label="Their job title" name="candidateJobTitle" required maxLength={150} />
              <Field label="Reason for leaving" name="reasonForLeaving" maxLength={500} />
              <SelectField label="Reliability and timekeeping" name="reliability" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="5">Excellent</option>
                <option value="4">Good</option>
                <option value="3">Satisfactory</option>
                <option value="2">Below standard</option>
                <option value="1">Poor</option>
              </SelectField>
              <SelectField label="Attitude and teamwork" name="attitude" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="5">Excellent</option>
                <option value="4">Good</option>
                <option value="3">Satisfactory</option>
                <option value="2">Below standard</option>
                <option value="1">Poor</option>
              </SelectField>
              <SelectField label="Were they ever subject to disciplinary action?" name="disciplinary" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </SelectField>
              <SelectField label="Do you know of any safeguarding concerns about them?" name="safeguardingConcerns" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </SelectField>
              {concern && <TextAreaField label="Please give details" name="concernDetails" required maxLength={3000} className="sm:col-span-2" />}
              <SelectField label="Would you employ them again?" name="wouldReemploy" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unsure">Not sure</option>
              </SelectField>
              <SelectField label="Are they suitable to work with vulnerable adults?" name="suitableForCare" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unsure">Not sure</option>
              </SelectField>
              <TextAreaField label="Anything else? (optional)" name="comments" maxLength={5000} className="sm:col-span-2" />
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" name="declaration" required className="mt-0.5 size-4 rounded border-slate-300" />
                <span>The information I have given is true and accurate to the best of my knowledge.</span>
              </label>
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="ghost" disabled={respond.isPending} onClick={() => window.confirm('Tell the company you can’t give a reference?') && respond.mutate({ declined: true })}>
                  I can&rsquo;t give a reference
                </Button>
                <Button type="submit" variant="accent" disabled={respond.isPending}>
                  {respond.isPending ? 'Sending…' : 'Send reference'}
                </Button>
              </div>
            </Card>
          </form>
        </>
      )}
    </CareersShell>
  );
}
