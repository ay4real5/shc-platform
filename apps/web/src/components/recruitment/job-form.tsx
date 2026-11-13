'use client';

import { DISCIPLINES, EMPLOYMENT_TYPES } from '@alora/shared';
import { useState, type FormEvent } from 'react';
import { AiAssist } from '@/components/ai/ai-assist';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { disciplineLabel, humanize } from '@/lib/labels';
import type { Job } from '@/lib/types/recruitment';

/** Create (no `job`) or edit a job advert. Status is changed with the buttons on the job page, not here. */
export function JobForm({ job, submitLabel, onSubmit }: { job?: Job; submitLabel: string; onSubmit(body: Record<string, unknown>): Promise<void> }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    const body: Record<string, unknown> = {
      title: text('title'),
      discipline: text('discipline'),
      employmentType: text('employmentType'),
      location: text('location'),
      payPeriod: text('payPeriod'),
      hours: text('hours'),
      summary: text('summary'),
      description: text('description'),
      closesOn: text('closesOn') || null,
    };
    for (const key of ['payFrom', 'payTo']) if (text(key)) body[key] = Number(text(key));
    if (!job) body.status = form.get('publish') === 'on' ? 'open' : 'draft';

    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
    } catch (e) {
      setError(e);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <ErrorAlert error={error} />
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Job title" name="title" required maxLength={150} defaultValue={job?.title} className="sm:col-span-2" placeholder="e.g. Care Worker" />
        <SelectField label="Job role" name="discipline" required defaultValue={job?.discipline ?? 'care_worker'}>
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {disciplineLabel(d)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Contract" name="employmentType" defaultValue={job?.employmentType ?? 'part_time'}>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </SelectField>
        <Field label="Location" name="location" required maxLength={150} defaultValue={job?.location} hint="As applicants will see it, e.g. Manchester (M14)." />
        <Field label="Hours" name="hours" maxLength={150} defaultValue={job?.hours ?? ''} hint="e.g. 16 to 37.5 hours a week, days and weekends." />
        <Field label="Pay from (£)" name="payFrom" type="number" step="0.01" min={0} defaultValue={job?.payFrom ?? ''} />
        <Field label="Pay to (£)" name="payTo" type="number" step="0.01" min={0} defaultValue={job?.payTo ?? ''} />
        <SelectField label="Pay is per" name="payPeriod" defaultValue={job?.payPeriod ?? 'hour'}>
          <option value="hour">Hour</option>
          <option value="year">Year</option>
        </SelectField>
        <Field label="Closing date (optional)" name="closesOn" type="date" defaultValue={job?.closesOn ?? ''} />
      </Card>
      <Card className="flex flex-col gap-4 p-5">
        <Field label="Short summary" name="summary" maxLength={300} defaultValue={job?.summary ?? ''} hint="One or two lines shown in the job list." />
        <TextAreaField label="Full description" name="description" required maxLength={20000} rows={10} defaultValue={job?.description} />
        <AiAssist
          kind="job_advert"
          field="description"
          label="Write the advert with AI from these notes"
          context={(form) => {
            const f = new FormData(form);
            return { jobTitle: String(f.get('title') ?? '') || undefined, discipline: String(f.get('discipline') ?? '') || undefined, location: String(f.get('location') ?? '') || undefined };
          }}
        />
        {!job && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="publish" defaultChecked className="size-4 rounded border-slate-300" />
            Publish on the careers page now (otherwise it is saved as a draft)
          </label>
        )}
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
