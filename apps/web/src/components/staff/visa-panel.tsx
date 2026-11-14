'use client';

import { SPONSOR_EVENT_LABELS, SPONSOR_EVENTS, SPONSORED_ROUTES, VISA_ROUTE_LABELS, VISA_ROUTES, type VisaRoute } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';

export interface VisaView {
  route: VisaRoute;
  routeLabel: string;
  sponsored: boolean;
  cosReference: string | null;
  socCode: string | null;
  startedOn: string | null;
  expiresOn: string;
  state: 'valid' | 'expiring_soon' | 'expired';
  weeklyHoursLimit: number | null;
  notes: string | null;
}
export interface SponsorReportView {
  id: string;
  eventLabel: string;
  happenedOn: string;
  dueBy: string;
  reportedOn: string | null;
  overdue: boolean;
  notes: string | null;
}
type VisaData = { visa: VisaView | null; reports: SponsorReportView[] };

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Visa & sponsorship (S5-04, S-031). Shows nothing for people without a visa unless an editor adds one. For workers the
 * company sponsors: the Certificate of Sponsorship, and changes to report to the Home Office within 10 working days.
 * SHC stores and reminds; the company's immigration adviser decides what the rules require.
 */
export function VisaPanel({ staffId, canEdit }: { staffId: string; canEdit: boolean }) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [route, setRoute] = useState<VisaRoute>('health_and_care');
  const data = useQuery({ queryKey: ['staff', staffId, 'visa'], queryFn: async () => (await request<VisaData>(`/staff/${staffId}/visa`)).data });
  const done = async () => {
    setEditing(false);
    setReporting(false);
    await queryClient.invalidateQueries({ queryKey: ['staff'] });
  };
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => request(`/staff/${staffId}/visa`, { method: 'PUT', body }), onSuccess: done });
  const report = useMutation({ mutationFn: (body: Record<string, unknown>) => request(`/staff/${staffId}/sponsor-reports`, { method: 'POST', body }), onSuccess: done });
  const reported = useMutation({
    mutationFn: (id: string) => request(`/staff/${staffId}/sponsor-reports/${id}/reported`, { method: 'POST', body: { reportedOn: todayIso() } }),
    onSuccess: done,
  });

  const visa = data.data?.visa ?? null;
  const reports = data.data?.reports ?? [];
  if (data.data && !visa && !editing && !canEdit) return null;

  const submitVisa = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim() || undefined;
    const sponsored = SPONSORED_ROUTES.includes(route);
    save.mutate({
      route,
      sponsored,
      ...(sponsored ? { cosReference: text('cosReference'), socCode: text('socCode') } : {}),
      startedOn: text('startedOn'),
      expiresOn: text('expiresOn'),
      weeklyHoursLimit: text('weeklyHoursLimit') ? Number(text('weeklyHoursLimit')) : undefined,
      notes: text('notes'),
    });
  };
  const submitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    report.mutate({ event: form.get('event'), happenedOn: form.get('happenedOn'), notes: String(form.get('notes') ?? '').trim() || undefined });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Visa &amp; sponsorship</h2>
        <div className="flex gap-2">
          {canEdit && visa?.sponsored && !reporting && (
            <Button variant="secondary" onClick={() => setReporting(true)}>
              Record a change to report
            </Button>
          )}
          {canEdit && !editing && (
            <Button
              variant="secondary"
              onClick={() => {
                setRoute(visa?.route ?? 'health_and_care');
                setEditing(true);
              }}
            >
              {visa ? 'Update visa' : 'Add visa details'}
            </Button>
          )}
        </div>
      </div>
      <ErrorAlert error={data.error ?? reported.error} />
      {data.data && !visa && !editing && <p className="text-sm text-slate-600">No visa on record. Add one for anyone whose right to work depends on a visa.</p>}

      {visa && !editing && (
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={visa.state === 'expired' ? 'expired' : visa.state === 'expiring_soon' ? 'expiring_soon' : 'active'} />
            <span className="font-medium text-slate-900">{visa.routeLabel}</span>
            {visa.sponsored && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">We sponsor them</span>}
          </div>
          <p className="mt-1 text-slate-700">
            Ends {formatDate(visa.expiresOn)}
            {visa.cosReference && <> · CoS {visa.cosReference}</>}
            {visa.socCode && <> · job code {visa.socCode}</>}
            {visa.weeklyHoursLimit && <> · up to {visa.weeklyHoursLimit} hours a week</>}
          </p>
          {visa.state !== 'valid' && (
            <p className={`mt-1 font-medium ${visa.state === 'expired' ? 'text-rose-800' : 'text-amber-800'}`}>
              {visa.state === 'expired'
                ? 'Visa has ended: they must not work until a new Right to Work check passes.'
                : 'Ends within 90 days: check their new permission (or extension application) and do a follow-up Right to Work check.'}
            </p>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={submitVisa} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <SelectField label="Visa or permission" name="route" value={route} onChange={(e) => setRoute(e.target.value as VisaRoute)} className="sm:col-span-2">
            {VISA_ROUTES.map((r) => (
              <option key={r} value={r}>
                {VISA_ROUTE_LABELS[r]}
              </option>
            ))}
          </SelectField>
          {SPONSORED_ROUTES.includes(route) && (
            <>
              <Field label="Certificate of Sponsorship reference" name="cosReference" defaultValue={visa?.cosReference ?? ''} maxLength={10} hint="10 letters and numbers, from the Sponsor Management System." />
              <Field label="Job code (SOC)" name="socCode" defaultValue={visa?.socCode ?? ''} maxLength={4} inputMode="numeric" hint="4 digits, as on the CoS." />
            </>
          )}
          <Field label="Visa start date" name="startedOn" type="date" defaultValue={visa?.startedOn ?? ''} />
          <Field label="Visa end date" name="expiresOn" type="date" required defaultValue={visa?.expiresOn ?? ''} hint="SHC reminds you 90 days before." />
          {route === 'student' && <Field label="Hours a week allowed" name="weeklyHoursLimit" type="number" min={1} max={48} defaultValue={visa?.weeklyHoursLimit ?? 20} />}
          <TextAreaField label="Notes (optional)" name="notes" rows={2} defaultValue={visa?.notes ?? ''} className="sm:col-span-2" />
          <ErrorAlert error={save.error} />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save visa'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {reporting && (
        <form onSubmit={submitReport} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <p className="text-sm text-slate-600 sm:col-span-2">
            Sponsors must report these changes on the Sponsor Management System within 10 working days. Record it here and SHC shows the deadline.
          </p>
          <SelectField label="What changed" name="event" required className="sm:col-span-2">
            {SPONSOR_EVENTS.map((e) => (
              <option key={e} value={e}>
                {SPONSOR_EVENT_LABELS[e]}
              </option>
            ))}
          </SelectField>
          <Field label="Date it happened" name="happenedOn" type="date" required defaultValue={todayIso()} max={todayIso()} />
          <TextAreaField label="Details (optional)" name="notes" rows={2} className="sm:col-span-2" />
          <ErrorAlert error={report.error} />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={report.isPending}>
              Save change
            </Button>
            <Button type="button" variant="ghost" onClick={() => setReporting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {reports.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Changes to report to the Home Office</h3>
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{r.eventLabel}</p>
                  <p className="text-slate-600">
                    Happened {formatDate(r.happenedOn)}
                    {r.notes && <> · {r.notes}</>}
                  </p>
                  {r.reportedOn ? (
                    <p className="text-emerald-800">Reported {formatDate(r.reportedOn)}.</p>
                  ) : (
                    <p className={r.overdue ? 'font-medium text-rose-800' : 'font-medium text-amber-800'}>
                      {r.overdue ? `Past the deadline (${formatDate(r.dueBy)}): report it now.` : `Report by ${formatDate(r.dueBy)}.`}
                    </p>
                  )}
                </div>
                {canEdit && !r.reportedOn && (
                  <Button variant="secondary" disabled={reported.isPending} onClick={() => reported.mutate(r.id)}>
                    Reported today
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {visa?.sponsored && <Alert tone="info">SHC keeps the record and reminds you. Check the current Home Office rules with your immigration adviser.</Alert>}
    </Card>
  );
}
