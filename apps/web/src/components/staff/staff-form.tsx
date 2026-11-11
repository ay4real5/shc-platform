'use client';

import { DISCIPLINES, EMPLOYMENT_TYPES } from '@alora/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { disciplineLabel, humanize } from '@/lib/labels';
import type { StaffCandidate, StaffDetail } from '@/lib/types/people';

const TEXT = ['employeeId', 'discipline', 'employmentType', 'hireDate', 'addressLine1', 'city', 'zip', 'notes', 'gender'] as const;
const MONEY = ['hourlyRate', 'overtimeRate', 'mileageRate'] as const;
const LISTS = ['skills', 'languages'] as const;

/**
 * Create (with `candidates`) or edit (with `staff`) a staff profile. Pay fields appear only when the user may see
 * pay (`showPay`) — the API hides them from everyone else anyway.
 */
export function StaffForm({
  staff,
  candidates,
  showPay,
  submitLabel,
  onSubmit,
}: {
  staff?: StaffDetail;
  candidates?: StaffCandidate[];
  showPay: boolean;
  submitLabel: string;
  onSubmit(body: Record<string, unknown>): Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    if (!staff) body.userId = form.get('userId');
    for (const key of TEXT) {
      const value = String(form.get(key) ?? '').trim();
      if (value) body[key] = value;
    }
    for (const key of MONEY) {
      const value = String(form.get(key) ?? '').trim();
      if (value) body[key] = Number(value);
    }
    for (const key of LISTS) {
      const raw = form.get(key);
      if (raw === null) continue;
      body[key] = String(raw).split(',').map((v) => v.trim()).filter(Boolean);
    }

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

  const v = (key: keyof StaffDetail) => (staff?.[key] as string | null | undefined) ?? '';
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <ErrorAlert error={error} />
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">Employment</h2>
        {!staff && (
          <SelectField label="Person" name="userId" required defaultValue="" className="sm:col-span-2">
            <option value="" disabled>
              Choose a user without a staff profile…
            </option>
            {candidates?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName}, {c.firstName} — {c.email}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField label="Job role" name="discipline" defaultValue={v('discipline')} required>
          <option value="" disabled>
            Choose…
          </option>
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {disciplineLabel(d)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Employment type" name="employmentType" defaultValue={v('employmentType') || 'full_time'}>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </SelectField>
        <Field label="Employee number" name="employeeId" defaultValue={v('employeeId')} hint="Your own reference, e.g. payroll number." />
        <Field label="Start date" name="hireDate" type="date" defaultValue={v('hireDate')} />
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">Skills and contact</h2>
        <Field label="Skills" name="skills" defaultValue={staff?.skills.join(', ') ?? ''} hint="Comma-separated, e.g. dementia care, PEG feeding." />
        <Field label="Languages" name="languages" defaultValue={staff?.languages.join(', ') ?? ''} hint="Comma-separated." />
        <Field label="Home address" name="addressLine1" defaultValue={v('addressLine1')} />
        <Field label="Town or city" name="city" defaultValue={v('city')} />
        <Field label="Postcode" name="zip" defaultValue={v('zip')} />
        <SelectField label="Gender (optional)" name="gender" defaultValue={v('gender')}>
          <option value="">Not recorded</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </SelectField>
      </Card>

      {showPay && (
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-base font-semibold text-slate-900 sm:col-span-2">Pay (only people who can see pay rates)</h2>
          <Field label="Hourly rate (£)" name="hourlyRate" type="number" step="0.01" min={0} defaultValue={staff?.pay?.hourlyRate ?? ''} />
          <Field label="Overtime rate (£)" name="overtimeRate" type="number" step="0.01" min={0} defaultValue={staff?.pay?.overtimeRate ?? ''} />
          <Field label="Mileage rate (£ per mile)" name="mileageRate" type="number" step="0.01" min={0} defaultValue={staff?.pay?.mileageRate ?? ''} hint="HMRC approved rate is 45p for the first 10,000 miles." />
        </Card>
      )}

      <Card className="p-5">
        <TextAreaField label="Notes" name="notes" defaultValue={v('notes')} />
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
