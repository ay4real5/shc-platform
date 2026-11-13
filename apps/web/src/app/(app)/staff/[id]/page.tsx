'use client';

import type { OnboardingChecklist } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, FileText, LayoutGrid, Mail, MessagesSquare, Phone, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { AvailabilityEditor, CredentialsPanel, TimeOffPanel } from '@/components/staff/staff-panels';
import { Button, ButtonLink } from '@/components/ui/button';
import { StaffDocumentsPanel } from '@/components/documents/signing';
import { CareCertificatePanel } from '@/components/staff/care-certificate-panel';
import { SupervisionsPanel } from '@/components/staff/supervisions-panel';
import { DbsPanel } from '@/components/staff/dbs-panel';
import { HealthPanel } from '@/components/staff/health';
import { OnboardingCard } from '@/components/staff/onboarding-card';
import { RightToWorkPanel } from '@/components/staff/right-to-work-panel';
import { Card } from '@/components/ui/card';
import { DetailList, ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel, humanize } from '@/lib/labels';
import type { StaffDetail } from '@/lib/types/people';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'checks', label: 'Checks & training', icon: ShieldCheck },
  { id: 'supervision', label: 'Supervision', icon: MessagesSquare },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'holiday', label: 'Holiday & availability', icon: CalendarDays },
] as const;
type Tab = (typeof TABS)[number]['id'];

// Older links use the section names (#time-off, #supervisions); they still land on the right tab.
const ALIASES: Record<string, Tab> = { 'time-off': 'holiday', supervisions: 'supervision', credentials: 'checks', 'right-to-work': 'checks', dbs: 'checks' };
const tabFromHash = (hash: string): Tab => {
  const h = hash.replace(/^#/, '');
  return ALIASES[h] ?? ((TABS.some((t) => t.id === h) ? h : 'overview') as Tab);
};
/** The address bar's #hash, kept in step with in-app links (which change it after this page first renders). */
const subscribeHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
};

/** A staff member's record (S-018/S4-03): a profile header with readiness, then tabs instead of one long page. */
export default function StaffMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { request, can, user } = useAuth();
  const queryClient = useQueryClient();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const [picked, setPicked] = useState<{ tab: Tab; hash: string } | null>(null);
  // A tab clicked here wins until the address changes from elsewhere (an in-app link, back/forward).
  const tab = picked && picked.hash === hash ? picked.tab : tabFromHash(hash);
  const staff = useQuery({ queryKey: ['staff', id], queryFn: async () => (await request<StaffDetail>(`/staff/${id}`)).data });
  const checklist = useQuery({
    queryKey: ['staff', id, 'onboarding'],
    enabled: Boolean(staff.data?.isActive),
    queryFn: async () => (await request<OnboardingChecklist>(`/staff/${id}/onboarding`)).data,
  });
  const terminate = useMutation({
    mutationFn: () => request(`/staff/${id}`, { method: 'DELETE', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  if (staff.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!staff.data) return <ErrorAlert error={staff.error} />;
  const s = staff.data;
  const isSelf = user?.id === s.userId;
  const canEdit = can('staff:update');
  const c = checklist.data;
  const choose = (next: Tab) => {
    window.history.replaceState(window.history.state, '', `#${next}`);
    setPicked({ tab: next, hash: `#${next}` });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-brand-900 font-display text-2xl font-semibold text-accent-300">
              {s.firstName[0]}
              {s.lastName[0]}
            </span>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-3 font-display text-[28px] font-bold leading-tight tracking-tight text-ink">
                {s.firstName} {s.lastName} <StatusBadge status={s.isActive ? 'active' : 'inactive'} />
              </h1>
              <p className="mt-0.5 text-sm text-slate-700">
                {disciplineLabel(s.discipline)} · {humanize(s.employmentType)}
                {s.employeeId && <> · {s.employeeId}</>}
                {s.hireDate && <> · Started {formatDate(s.hireDate)}</>}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Mail aria-hidden className="h-3.5 w-3.5" /> {s.email}
                </span>
                {s.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone aria-hidden className="h-3.5 w-3.5" /> {s.phone}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            {c && <Readiness percent={c.percent} ready={c.ready} />}
            <div className="flex flex-wrap gap-2">
              {can('compliance:read') && can('staff:read') && (
                <ButtonLink href={`/compliance/inspection/pack?ids=${s.id}`} variant="secondary">
                  <ClipboardList aria-hidden className="h-4 w-4" /> Inspection pack
                </ButtonLink>
              )}
              {canEdit && (
                <ButtonLink href={`/staff/${id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
              )}
              {can('staff:delete') && s.isActive && !isSelf && (
                <Button
                  variant="danger"
                  disabled={terminate.isPending}
                  onClick={() => window.confirm(`End ${s.firstName}'s employment today? Their login is managed separately in Users.`) && terminate.mutate()}
                >
                  End employment
                </Button>
              )}
            </div>
          </div>
        </div>
        <div role="tablist" aria-label="Staff record" className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50/60 px-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                onClick={() => choose(t.id)}
                className={`relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  active ? 'text-brand-900' : 'text-slate-600 hover:text-brand-800'
                }`}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {t.label}
                {active && <span aria-hidden className="absolute inset-x-2 bottom-0 h-[3px] bg-accent-500" />}
              </button>
            );
          })}
        </div>
      </Card>
      <ErrorAlert error={terminate.error} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-6">
        {tab === 'overview' && (
          <>
            {s.isActive && <OnboardingCard staffId={s.id} />}
            <div className={`grid gap-6 ${s.pay ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
              <Section title="Personal details">
                <DetailList
                  items={[
                    ['Email', s.email],
                    ['Phone', s.phone],
                    ['Started', formatDate(s.hireDate)],
                    ['Employment ended', formatDate(s.terminationDate)],
                    ['Date of birth', formatDate(s.dateOfBirth)],
                    ['Home', [s.addressLine1, s.addressLine2, s.town, s.postcode].filter(Boolean).join(', ')],
                    ['Languages', s.languages.join(', ')],
                    ['Skills', s.skills.join(', ')],
                    ['Drives for work', s.canDrive ? 'Yes' : 'No'],
                    [
                      'Emergency contact',
                      [s.emergencyContact.name, s.emergencyContact.relationship && `(${s.emergencyContact.relationship})`, s.emergencyContact.phone]
                        .filter(Boolean)
                        .join(' '),
                    ],
                  ]}
                />
              </Section>
              {s.pay && (
                <Section title="Pay">
                  <DetailList
                    items={[
                      ['Hourly', s.pay.hourlyRate && `£${s.pay.hourlyRate}`],
                      ['Overtime', s.pay.overtimeRate && `£${s.pay.overtimeRate}`],
                      ['Mileage', s.pay.mileageRate && `£${s.pay.mileageRate} per mile`],
                      ['NI number', s.pay.niNumberEnding && `ending ${s.pay.niNumberEnding}`],
                    ]}
                  />
                </Section>
              )}
            </div>
          </>
        )}
        {tab === 'checks' && (
          <>
            <RightToWorkPanel staffId={id} canEdit={canEdit} />
            <DbsPanel staffId={id} canEdit={canEdit} isSelf={isSelf} />
            <HealthPanel staffId={id} isSelf={isSelf} />
            <CareCertificatePanel staffId={id} isSelf={isSelf} />
            <CredentialsPanel staffId={id} canEdit={canEdit} />
          </>
        )}
        {tab === 'supervision' && <SupervisionsPanel staffId={id} isSelf={isSelf} />}
        {tab === 'documents' && <StaffDocumentsPanel staffId={id} />}
        {tab === 'holiday' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <TimeOffPanel staffId={id} canRequest={isSelf || canEdit} canApprove={can('time_off:approve')} isSelf={isSelf} />
            <AvailabilityEditor staffId={id} canEdit={isSelf || canEdit} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </Card>
  );
}

/** Big readiness figure for the header: the same checklist as the Onboarding card. */
function Readiness({ percent, ready }: { percent: number; ready: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className={`text-sm font-semibold ${ready ? 'text-emerald-700' : 'text-amber-800'}`}>{ready ? 'Ready to work' : 'Not ready to work yet'}</p>
        <div className="mt-1 h-2 w-40 overflow-hidden rounded-sm bg-slate-200" aria-hidden>
          <div className={`h-full ${ready ? 'bg-emerald-500' : 'bg-accent-500'}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <p className="font-display text-3xl font-semibold text-ink" aria-label={`${percent}% ready`}>
        {percent}%
      </p>
    </div>
  );
}
