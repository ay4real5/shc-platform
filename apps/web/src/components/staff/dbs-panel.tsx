'use client';

import { DBS_LEVEL_LABELS, DBS_LEVELS } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';

interface DbsCheck {
  id: string;
  certificateNumber: string;
  issueDate: string;
  levelLabel: string;
  result: 'clear' | 'information' | string;
  decision: string | null;
  decidedBy: { id: string; name: string } | null;
  updateService: boolean;
  nextDueOn: string;
  acceptable: boolean;
  recordedBy: { id: string; name: string } | null;
  notes: string | null;
  statusChecks: { checkedOn: string; result: string; checkedBy: { id: string; name: string } | null }[];
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * DBS (S2-02): the newest certificate, whether it clears them for care work, Update Service status checks, and a
 * manager's decision when a certificate shows information. Never record what a certificate says.
 */
export function DbsPanel({ staffId, canEdit, isSelf }: { staffId: string; canEdit: boolean; isSelf: boolean }) {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const checks = useQuery({ queryKey: ['staff', staffId, 'dbs'], queryFn: async () => (await request<DbsCheck[]>(`/staff/${staffId}/dbs`)).data });
  const done = async () => {
    setAdding(false);
    setChecking(false);
    await queryClient.invalidateQueries({ queryKey: ['staff'] });
  };
  const record = useMutation({ mutationFn: (body: Record<string, unknown>) => request(`/staff/${staffId}/dbs`, { method: 'POST', body }), onSuccess: done });
  const status = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => request(`/staff/${staffId}/dbs/${id}/status-checks`, { method: 'POST', body }),
    onSuccess: done,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) => request(`/staff/${staffId}/dbs/${id}/decision`, { method: 'POST', body: { decision } }),
    onSuccess: done,
  });

  const latest = checks.data?.[0];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    record.mutate({
      certificateNumber: String(form.get('certificateNumber') ?? '').trim(),
      issueDate: String(form.get('issueDate') ?? ''),
      level: String(form.get('level') ?? ''),
      result: String(form.get('result') ?? ''),
      updateService: form.get('updateService') === 'on',
    });
  };

  const submitStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    status.mutate({ id: latest!.id, body: { checkedOn: String(form.get('checkedOn') ?? ''), result: String(form.get('result') ?? '') } });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">DBS</h2>
        <div className="flex gap-2">
          {canEdit && latest?.updateService && !checking && (
            <Button variant="secondary" onClick={() => setChecking(true)}>
              Record a status check
            </Button>
          )}
          {canEdit && !adding && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add a certificate
            </Button>
          )}
        </div>
      </div>
      <ErrorAlert error={checks.error ?? decide.error} />
      {checks.data && !latest && !adding && <Alert tone="warning">No DBS certificate on file. They must not start care work until an enhanced check with the adults&rsquo; barred list is clear.</Alert>}

      {latest && (
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={latest.acceptable ? 'verified' : 'pending'} />
            <span className="font-medium text-slate-900">{latest.levelLabel}</span>
            <span className="tabular-nums tracking-wide text-slate-600">{latest.certificateNumber}</span>
          </div>
          <p className="mt-1 text-slate-700">
            Issued {formatDate(latest.issueDate)} · {latest.result === 'clear' ? 'Clear' : 'Shows information'}
            {latest.recordedBy ? ` · recorded by ${latest.recordedBy.name}` : ''}
          </p>
          {latest.result === 'information' && (
            <p className="mt-1 text-slate-700">
              {latest.decision
                ? `Risk assessment: ${latest.decision === 'approved' ? 'may work' : 'may not work'}${latest.decidedBy ? ` (${latest.decidedBy.name})` : ''}.`
                : 'Waiting for a manager’s risk assessment before they can start.'}
            </p>
          )}
          {latest.statusChecks[0]?.result === 'new_information' && <p className="mt-1 font-medium text-rose-800">The Update Service reported new information: get a new DBS check.</p>}
          {latest.acceptable && (
            <p className="mt-1 font-medium text-amber-800">
              {latest.updateService ? 'Update Service status check' : 'New DBS check'} due {formatDate(latest.nextDueOn)}.
            </p>
          )}
          {latest.statusChecks.length > 0 && (
            <p className="mt-1 text-slate-600">
              Last status check {formatDate(latest.statusChecks[0]!.checkedOn)}: {latest.statusChecks[0]!.result === 'no_change' ? 'no change' : 'new information'}.
            </p>
          )}
          {latest.result === 'information' && !latest.decision && can('compliance:update') && !isSelf && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={decide.isPending} onClick={() => decide.mutate({ id: latest.id, decision: 'approved' })}>
                Risk assessed: may work
              </Button>
              <Button variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ id: latest.id, decision: 'not_approved' })}>
                May not work
              </Button>
            </div>
          )}
        </div>
      )}

      {checking && latest && (
        <form onSubmit={submitStatus} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <p className="text-sm text-slate-600 sm:col-span-2">Check the certificate on gov.uk &ldquo;DBS Update Service: check a certificate&rdquo;, then record the result.</p>
          <Field label="Date checked" name="checkedOn" type="date" required defaultValue={today()} max={today()} />
          <SelectField label="Result" name="result" defaultValue="no_change">
            <option value="no_change">No change since it was issued</option>
            <option value="new_information">New information: apply for a new check</option>
          </SelectField>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={status.isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setChecking(false)}>
              Cancel
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorAlert error={status.error} />
          </div>
        </form>
      )}

      {adding && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <p className="text-sm text-slate-600 sm:col-span-2">
            Record the certificate details only. Don&rsquo;t keep a copy, and never write down what a certificate says.
          </p>
          <Field label="Certificate number" name="certificateNumber" required inputMode="numeric" maxLength={14} placeholder="12 digits" autoComplete="off" />
          <Field label="Issue date" name="issueDate" type="date" required max={today()} />
          <SelectField label="Level" name="level" defaultValue="enhanced_barred_adults">
            {DBS_LEVELS.map((l) => (
              <option key={l} value={l}>
                {DBS_LEVEL_LABELS[l]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Result" name="result" defaultValue="clear">
            <option value="clear">Clear</option>
            <option value="information">Shows information (a manager must risk-assess)</option>
          </SelectField>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" name="updateService" className="size-4 rounded border-slate-300" />
            They are on the DBS Update Service (we&rsquo;ll remind you to do a status check every year)
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={record.isPending}>
              Save certificate
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorAlert error={record.error} />
          </div>
        </form>
      )}

      {checks.data && checks.data.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-700">Earlier certificates ({checks.data.length - 1})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-slate-600">
            {checks.data.slice(1).map((c) => (
              <li key={c.id}>
                {formatDate(c.issueDate)}: {c.levelLabel}, {c.result === 'clear' ? 'clear' : 'information'} ({c.certificateNumber})
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
