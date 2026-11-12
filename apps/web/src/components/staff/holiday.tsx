'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Palmtree } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/lib/auth/auth-provider';

export interface HolidaySummary {
  leaveYear: { start: string; end: string };
  daysPerWeek: number;
  daysPerWeekSet: boolean;
  statutory: number;
  override: number | null;
  entitlement: number;
  proRated: boolean;
  taken: number;
  booked: number;
  pending: number;
  remaining: number;
}

export interface AbsenceSummary {
  from: string;
  to: string;
  spells: number;
  days: number;
  bradford: number;
  band: 'none' | 'low' | 'review' | 'high';
  periods: { startDate: string; endDate: string; days: number }[];
}

export const BAND_TEXT: Record<AbsenceSummary['band'], { label: string; className: string }> = {
  none: { label: 'No sickness', className: 'text-slate-600' },
  low: { label: 'Low', className: 'text-emerald-800' },
  review: { label: 'Worth a review', className: 'text-amber-800' },
  high: { label: 'High: follow your absence policy', className: 'text-red-700' },
};

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Holiday balance and sickness (S3-03), at the top of the staff page's time-off panel. */
export function HolidaySummaryBlock({ staffId, canEdit }: { staffId: string; canEdit: boolean }) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const holiday = useQuery({ queryKey: ['staff', staffId, 'holiday'], queryFn: async () => (await request<HolidaySummary>(`/staff/${staffId}/holiday`)).data });
  const absence = useQuery({ queryKey: ['staff', staffId, 'absence'], queryFn: async () => (await request<AbsenceSummary>(`/staff/${staffId}/absence`)).data });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => request(`/staff/${staffId}/holiday`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['staff', staffId] });
    },
  });
  const h = holiday.data;
  const a = absence.data;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const override = String(form.get('holidayDaysOverride') ?? '').trim();
    save.mutate({ daysPerWeek: Number(form.get('daysPerWeek')), holidayDaysOverride: override ? Number(override) : null });
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl bg-canvas p-4 text-sm">
      <ErrorAlert error={holiday.error ?? absence.error ?? save.error} />
      {h && (
        <div className="flex flex-col gap-1">
          <p className="text-slate-900">
            <span className="text-lg font-semibold">{h.remaining}</span> of {days(h.entitlement)} holiday left
            <span className="text-slate-600">
              {' '}
              · leave year {formatDate(h.leaveYear.start)} – {formatDate(h.leaveYear.end)}
            </span>
          </p>
          <p className="text-slate-700">
            {h.taken} taken · {h.booked} booked{h.pending ? ` · ${h.pending} waiting for approval` : ''}
          </p>
          <p className="text-xs text-slate-600">
            {h.override !== null ? `Set by the office: ${days(h.override)} a year` : `Statutory 5.6 weeks for ${h.daysPerWeek} days a week (${days(h.statutory)}, max 28)`}
            {h.proRated ? ', pro-rated from their start date' : ''}.{!h.daysPerWeekSet && h.override === null ? ' Days per week not recorded yet: 5 assumed.' : ''}
          </p>
        </div>
      )}
      {a && (
        <p className="text-slate-700">
          Sickness, last 52 weeks: {a.spells} {a.spells === 1 ? 'spell' : 'spells'}, {days(a.days)}
          {a.spells > 0 && (
            <>
              {' '}
              · Bradford score {a.bradford} <span className={`font-medium ${BAND_TEXT[a.band].className}`}>({BAND_TEXT[a.band].label})</span>
            </>
          )}
        </p>
      )}
      {canEdit && h && !editing && (
        <div>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Change holiday allowance
          </Button>
        </div>
      )}
      {canEdit && h && editing && (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Days worked a week" name="daysPerWeek" type="number" min={0.5} max={7} step={0.5} defaultValue={h.daysPerWeek} required />
          <Field
            label="Days a year (optional)"
            name="holidayDaysOverride"
            type="number"
            min={0}
            max={60}
            step={0.5}
            defaultValue={h.override ?? ''}
            hint="For zero-hours or bank staff (12.07% of hours), or a contract above statutory. Blank = statutory."
          />
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Home page for staff: holiday left this leave year. */
export function HolidayBalanceCard() {
  const { request } = useAuth();
  const me = useQuery({ queryKey: ['staff', 'me', 'id'], retry: false, queryFn: async () => (await request<{ id: string }>('/staff/me')).data });
  const holiday = useQuery({
    queryKey: ['staff', me.data?.id, 'holiday'],
    enabled: Boolean(me.data?.id),
    queryFn: async () => (await request<HolidaySummary>(`/staff/${me.data!.id}/holiday`)).data,
  });
  const h = holiday.data;
  if (!me.data || !h) return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="flex items-center gap-2 text-sm text-slate-800">
        <Palmtree aria-hidden className="h-5 w-5 text-brand-600" />
        <span>
          <span className="font-semibold">{days(h.remaining)}</span> holiday left this leave year
          {h.pending ? ` (${h.pending} waiting for approval)` : ''}
        </span>
      </p>
      <ButtonLink href={`/staff/${me.data.id}#time-off`} variant="secondary">
        Book time off
      </ButtonLink>
    </Card>
  );
}
