'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { DetailList, ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/lib/auth/auth-provider';
import type { ApplicationDetail } from '@/lib/types/recruitment';

interface Answers {
  refereeName: string;
  refereeJobTitle: string;
  organisation: string;
  employedFrom: string;
  employedTo?: string;
  candidateJobTitle: string;
  reasonForLeaving?: string;
  reliability: number;
  attitude: number;
  disciplinary: string;
  safeguardingConcerns: string;
  concernDetails?: string;
  wouldReemploy: string;
  suitableForCare: string;
  comments?: string;
}

interface Reference {
  id: string;
  referee: { id: string; name: string; organisation: string | null; relationship: string; email: string };
  status: 'sent' | 'received' | 'declined' | 'cancelled' | string;
  sentAt: string;
  expiresAt: string;
  emailSent: boolean;
  respondedAt: string | null;
  answers: Answers | null;
  flagged: boolean;
  verified: { by: { id: string; name: string } | null; at: string; note: string | null } | null;
}

const yesNo = (v: string) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not sure');

/** References (S2-03): send requests, see answers as they arrive, and note how each was verified. */
export function ReferencesPanel({ app }: { app: ApplicationDetail }) {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const [links, setLinks] = useState<{ refereeId: string; link: string }[]>([]);
  const refs = useQuery({
    queryKey: ['recruitment', 'applications', app.id, 'references'],
    queryFn: async () => (await request<Reference[]>(`/recruitment/applications/${app.id}/references`)).data,
  });
  const send = useMutation({
    mutationFn: (refereeIds: string[]) =>
      request<{ links: { refereeId: string; link: string }[] }>(`/recruitment/applications/${app.id}/references`, { method: 'POST', body: { refereeIds } }),
    onSuccess: async ({ data }) => {
      setLinks(data.links);
      await queryClient.invalidateQueries({ queryKey: ['recruitment', 'applications', app.id] });
    },
  });
  const manage = can('recruitment:manage');
  const beforeOffer = !['offer', 'hired'].includes(app.stage);
  const open = !['rejected', 'withdrawn'].includes(app.stage);

  // Newest request per referee (older ones were replaced).
  const latest = new Map<string, Reference>();
  for (const r of refs.data ?? []) if (!latest.has(r.referee.id)) latest.set(r.referee.id, r);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-base font-semibold text-slate-900">References</h2>
      <ErrorAlert error={refs.error ?? send.error} />
      {links.length > 0 && (
        <Alert tone="info">
          <p>Email isn&rsquo;t set up yet, so send {links.length === 1 ? 'this link' : 'these links'} to the referee yourself (each works once, for 30 days):</p>
          <ul className="mt-1 flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.refereeId} className="break-all font-mono text-xs">
                {app.referees.find((r) => r.id === l.refereeId)?.name}: {l.link}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <ul className="flex flex-col gap-3">
        {app.referees.map((referee) => {
          const ref = latest.get(referee.id);
          const blocked = beforeOffer && !referee.contactBeforeOffer;
          return (
            <li key={referee.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    {referee.name} {ref && <StatusBadge status={ref.status === 'sent' ? 'pending' : ref.status === 'received' ? (ref.flagged ? 'exception' : 'completed') : ref.status} />}
                  </p>
                  <p className="text-slate-600">{[referee.relationship, referee.organisation].filter(Boolean).join(' · ')}</p>
                  <p className="text-slate-600">{[referee.email, referee.phone].filter(Boolean).join(' · ')}</p>
                </div>
                {manage && open && ref?.status !== 'received' && (
                  <Button
                    variant="secondary"
                    disabled={blocked || send.isPending}
                    title={blocked ? 'They asked not to be contacted before an offer' : undefined}
                    onClick={() => send.mutate([referee.id])}
                  >
                    {ref ? 'Send again' : 'Send request'}
                  </Button>
                )}
              </div>
              {blocked && !ref && <p className="mt-1 text-xs text-slate-500">Contact only after an offer.</p>}
              {ref?.status === 'sent' && <p className="mt-1 text-slate-600">Requested {formatDate(ref.sentAt)}, waiting for a reply.</p>}
              {ref?.status === 'declined' && <p className="mt-1 text-slate-600">The referee declined to give a reference. Ask the applicant for another referee.</p>}
              {ref?.answers && (
                <div className="mt-3 flex flex-col gap-2">
                  {ref.flagged && <Alert tone="warning">This reference raises a concern. Read it carefully and record your decision on the timeline.</Alert>}
                  <DetailList
                    items={[
                      ['Answered by', `${ref.answers.refereeName}, ${ref.answers.refereeJobTitle} at ${ref.answers.organisation}`],
                      ['Employed', `${formatDate(ref.answers.employedFrom)} to ${ref.answers.employedTo ? formatDate(ref.answers.employedTo) : 'now'} as ${ref.answers.candidateJobTitle}`],
                      ['Reason for leaving', ref.answers.reasonForLeaving],
                      ['Reliability / attitude', `${ref.answers.reliability}/5 · ${ref.answers.attitude}/5`],
                      ['Disciplinary action', yesNo(ref.answers.disciplinary)],
                      ['Safeguarding concerns', yesNo(ref.answers.safeguardingConcerns)],
                      ['Would re-employ', yesNo(ref.answers.wouldReemploy)],
                      ['Suitable for care work', yesNo(ref.answers.suitableForCare)],
                    ]}
                  />
                  {ref.answers.concernDetails && <p className="text-slate-800">Details: {ref.answers.concernDetails}</p>}
                  {ref.answers.comments && <p className="text-slate-700">&ldquo;{ref.answers.comments}&rdquo;</p>}
                  <VerifyRow reference={ref} applicationId={app.id} editable={manage} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function VerifyRow({ reference, applicationId, editable }: { reference: Reference; applicationId: string; editable: boolean }) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const verify = useMutation({
    mutationFn: () => request(`/recruitment/references/${reference.id}/verify`, { method: 'POST', body: { note } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recruitment', 'applications', applicationId, 'references'] }),
  });
  if (reference.verified) {
    return (
      <p className="text-emerald-800">
        Verified {formatDate(reference.verified.at)}
        {reference.verified.by ? ` by ${reference.verified.by.name}` : ''}: {reference.verified.note}
      </p>
    );
  }
  if (!editable) return <p className="text-slate-500">Not verified yet.</p>;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) verify.mutate();
      }}
    >
      <Field label="How did you verify it?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. phoned the employer's main number" className="min-w-64 flex-1" />
      <Button type="submit" variant="secondary" disabled={!note.trim() || verify.isPending}>
        Mark verified
      </Button>
      <ErrorAlert error={verify.error} />
    </form>
  );
}
