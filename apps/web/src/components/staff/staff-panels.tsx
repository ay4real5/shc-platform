'use client';

import { CREDENTIAL_TYPE_LABELS, TIME_OFF_TYPES, credentialTypeLabel } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';
import { HolidaySummaryBlock } from './holiday';
import { dayName, humanize } from '@/lib/labels';
import type { AvailabilitySlot, Credential, TimeOff } from '@/lib/types/people';

/** A mutation that refreshes this staff member's data afterwards and resolves true/false (errors shown by caller). */
function useStaffAction(staffId: string) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown }) =>
      request(path, { method, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });
  const run = (path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) =>
    mutation.mutateAsync({ path: `/staff/${staffId}${path}`, method, body }).then(
      () => true,
      () => false,
    );
  return { run, error: mutation.error, busy: mutation.isPending };
}

export function CredentialsPanel({ staffId, canEdit }: { staffId: string; canEdit: boolean }) {
  const { request } = useAuth();
  const { run, error, busy } = useStaffAction(staffId);
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: ['staff', staffId, 'credentials'],
    queryFn: async () => (await request<Credential[]>(`/staff/${staffId}/credentials`)).data,
  });

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const body: Record<string, unknown> = {};
    for (const key of ['credentialType', 'credentialName', 'credentialNumber', 'issuingAuthority', 'issueDate', 'expiryDate']) {
      const value = String(form.get(key) ?? '').trim();
      if (value) body[key] = value;
    }
    if (await run('/credentials', 'POST', body)) {
      formEl.reset();
      setAdding(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Credentials</h2>
          <p className="text-xs text-slate-600">Training, licences and checks on file, with their expiry dates.</p>
        </div>
        {canEdit && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="h-4 w-4" /> New credential
          </Button>
        )}
      </div>
      <ErrorAlert error={error ?? list.error} />
      {canEdit && adding && (
        <form onSubmit={(e) => void add(e)} className="mb-4 grid gap-3 rounded-md border border-brand-100 bg-brand-50/40 p-4 sm:grid-cols-2">
          <Field
            label="Credential type"
            name="credentialType"
            list={`credential-types-${staffId}`}
            placeholder="driving_licence, first_aid…"
            hint="Adding a newer one of the same type replaces the old one, and its expiry alerts stop."
            required
          />
          <datalist id={`credential-types-${staffId}`}>
            {Object.entries(CREDENTIAL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </datalist>
          <Field label="Credential name" name="credentialName" placeholder="Full UK driving licence" required />
          <Field label="Number" name="credentialNumber" />
          <Field label="Issued by" name="issuingAuthority" />
          <Field label="Issue date" name="issueDate" type="date" />
          <Field label="Expiry date" name="expiryDate" type="date" />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>
              Add credential
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-slate-100 text-sm">
        {list.data?.map((c) => {
          const typeLabel = credentialTypeLabel(c.credentialType);
          return (
            <li key={c.id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 ${c.status === 'superseded' ? 'opacity-70' : ''}`}>
              <span className="min-w-0">
                <span className="font-medium text-ink">{c.credentialName}</span>
                {typeLabel.toLowerCase() !== c.credentialName.toLowerCase() && <span className="text-slate-500"> · {typeLabel}</span>}
                <span className="block text-xs text-slate-600">
                  {c.expiryDate ? `Expires ${formatDate(c.expiryDate)}` : 'No expiry'}
                  {c.verifiedAt ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
                      <BadgeCheck aria-hidden className="h-3.5 w-3.5" /> verified
                    </span>
                  ) : (
                    <span className="ml-2 text-slate-500">not verified yet</span>
                  )}
                </span>
              </span>
              <span className="flex items-center gap-1">
                {c.status === 'superseded' ? <span className="text-xs text-slate-600">Replaced by a newer one</span> : c.expiryDate && <StatusBadge status={c.state} />}
                {canEdit && !c.verifiedAt && (
                  <Button variant="ghost" className="px-2.5 py-1 text-xs" disabled={busy} onClick={() => void run(`/credentials/${c.id}`, 'PATCH', { verified: true })}>
                    Mark verified
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-slate-500 hover:text-rose-700"
                    disabled={busy}
                    aria-label={`Remove ${c.credentialName}`}
                    title="Remove"
                    onClick={() => window.confirm(`Remove ${c.credentialName}?`) && void run(`/credentials/${c.id}`, 'DELETE')}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </Button>
                )}
              </span>
            </li>
          );
        })}
        {list.data?.length === 0 && <li className="py-2 text-slate-500">No credentials recorded.</li>}
      </ul>
    </Card>
  );
}

export function AvailabilityEditor({ staffId, canEdit }: { staffId: string; canEdit: boolean }) {
  const { request } = useAuth();
  const current = useQuery({
    queryKey: ['staff', staffId, 'availability'],
    queryFn: async () => (await request<AvailabilitySlot[]>(`/staff/${staffId}/availability`)).data,
  });
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Weekly availability</h2>
      <p className="mb-4 text-xs text-slate-500">Used to warn schedulers about visits outside these hours.</p>
      {current.data && (
        <AvailabilityForm key={JSON.stringify(current.data)} staffId={staffId} saved={current.data} canEdit={canEdit} />
      )}
    </Card>
  );
}

function AvailabilityForm({ staffId, saved, canEdit }: { staffId: string; saved: AvailabilitySlot[]; canEdit: boolean }) {
  const { run, error, busy } = useStaffAction(staffId);
  const [slots, setSlots] = useState(saved);
  const update = (i: number, patch: Partial<AvailabilitySlot>) =>
    setSlots((all) => all.map((slot, n) => (n === i ? { ...slot, ...patch } : slot)));

  return (
    <div className="flex flex-col gap-3">
      <ErrorAlert error={error} />
      {slots.length === 0 && <p className="text-sm text-slate-500">No availability set — any time is assumed.</p>}
      {slots.map((slot, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3">
          <SelectField label="Day" value={slot.dayOfWeek} disabled={!canEdit} onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </SelectField>
          <Field label="From" type="time" value={slot.startTime} disabled={!canEdit} onChange={(e) => update(i, { startTime: e.target.value })} />
          <Field label="To" type="time" value={slot.endTime} disabled={!canEdit} onChange={(e) => update(i, { endTime: e.target.value })} />
          {canEdit && (
            <Button variant="ghost" onClick={() => setSlots((all) => all.filter((_, n) => n !== i))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setSlots((all) => [...all, { dayOfWeek: 1, startTime: '08:00', endTime: '17:00' }])}
          >
            Add time slot
          </Button>
          <Button disabled={busy} onClick={() => void run('/availability', 'PUT', { slots })}>
            Save availability
          </Button>
        </div>
      )}
    </div>
  );
}

export function TimeOffPanel({
  staffId,
  canRequest,
  canApprove,
  isSelf,
}: {
  staffId: string;
  canRequest: boolean;
  canApprove: boolean;
  isSelf: boolean;
}) {
  const { request, can } = useAuth();
  const { run, error, busy } = useStaffAction(staffId);
  const list = useQuery({
    queryKey: ['staff', staffId, 'time-off'],
    queryFn: async () => (await request<TimeOff[]>(`/staff/${staffId}/time-off`)).data,
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const notes = String(form.get('notes') ?? '').trim();
    const days = String(form.get('days') ?? '').trim();
    const ok = await run('/time-off', 'POST', {
      startDate: form.get('startDate'),
      endDate: form.get('endDate'),
      type: form.get('type'),
      ...(days ? { days: Number(days) } : {}),
      ...(notes ? { notes } : {}),
    });
    if (ok) formEl.reset();
  };

  return (
    <Card id="time-off" className="scroll-mt-6 p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Holiday and time off</h2>
      <HolidaySummaryBlock staffId={staffId} canEdit={!isSelf && can('staff:update')} />
      <ErrorAlert error={error ?? list.error} />
      <ul className="mb-4 divide-y divide-slate-100 text-sm">
        {list.data?.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {formatDate(t.startDate)} – {formatDate(t.endDate)} · {humanize(t.type)}
              {t.workingDays !== null && <span className="text-slate-500"> · {t.workingDays} working day{t.workingDays === 1 ? '' : 's'}</span>}
            </span>
            <span className="flex items-center gap-2">
              <StatusBadge status={t.status} />
              {t.status === 'pending' && canApprove && !isSelf && (
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => void run(`/time-off/${t.id}`, 'PATCH', { status: 'approved' })}>
                    Approve
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void run(`/time-off/${t.id}`, 'PATCH', { status: 'denied' })}>
                    Deny
                  </Button>
                </>
              )}
              {t.status === 'pending' && canRequest && (
                <Button variant="ghost" disabled={busy} onClick={() => void run(`/time-off/${t.id}`, 'PATCH', { status: 'cancelled' })}>
                  Cancel request
                </Button>
              )}
            </span>
          </li>
        ))}
        {list.data?.length === 0 && <li className="py-2 text-slate-500">No time-off requests.</li>}
      </ul>
      {canRequest && (
        <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2">
          <Field label="From" name="startDate" type="date" required />
          <Field label="To" name="endDate" type="date" required />
          <SelectField label="Type" name="type" defaultValue="annual_leave">
            {TIME_OFF_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </SelectField>
          <Field label="Working days it uses (optional)" name="days" type="number" min={0.5} max={60} step={0.5} hint="Leave blank to count working days. Use 0.5 for a half day." />
          <Field label="Notes" name="notes" hint={isSelf ? undefined : 'For sickness, keep medical details out: just the dates.'} />
          <Button type="submit" variant="secondary" disabled={busy} className="sm:justify-self-start">
            {isSelf ? 'Request time off' : can('time_off:approve') ? 'Record time off (approved)' : 'Record time off'}
          </Button>
        </form>
      )}
    </Card>
  );
}
