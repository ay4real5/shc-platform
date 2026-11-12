'use client';

import { RTW_DOCUMENT_TYPES, RTW_DOCUMENTS, type RtwDocumentType } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField, TextAreaField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';

interface RtwCheck {
  id: string;
  method: string;
  methodLabel: string;
  shareCodeEnding: string | null;
  documentLabel: string | null;
  seenHow: string | null;
  permission: string;
  permissionExpiresOn: string | null;
  followUpOn: string | null;
  restrictions: string | null;
  outcome: string;
  checkedOn: string;
  checkedBy: { id: string; name: string } | null;
  documentId: string | null;
  notes: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Right to Work (S2-01): the latest check, its history, and a guided form to record a new one — online with a share
 * code (the Home Office "view a job applicant's right to work" service), or a manual check of original documents.
 */
export function RightToWorkPanel({ staffId, canEdit }: { staffId: string; canEdit: boolean }) {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'share_code' | 'manual_document'>('share_code');
  const [documentType, setDocumentType] = useState<RtwDocumentType>('british_irish_passport');
  const [permission, setPermission] = useState<'unlimited' | 'time_limited'>('unlimited');
  const [outcome, setOutcome] = useState<'passed' | 'failed'>('passed');
  const checks = useQuery({
    queryKey: ['staff', staffId, 'right-to-work'],
    queryFn: async () => (await request<RtwCheck[]>(`/staff/${staffId}/right-to-work`)).data,
  });
  const record = useMutation({
    mutationFn: async (form: FormData) => {
      const text = (k: string) => String(form.get(k) ?? '').trim();
      let documentId: string | undefined;
      const file = form.get('evidence');
      if (file instanceof File && file.size > 0) {
        const upload = new FormData();
        upload.set('file', file);
        upload.set('documentType', 'right_to_work');
        upload.set('title', `Right to Work check ${text('checkedOn')}`);
        upload.set('staffId', staffId);
        documentId = (await request<{ id: string }>('/documents', { method: 'POST', body: upload })).data.id;
      }
      const listA = method === 'manual_document' && RTW_DOCUMENTS[documentType].list === 'A';
      return request(`/staff/${staffId}/right-to-work`, {
        method: 'POST',
        body: {
          method,
          ...(method === 'share_code' ? { shareCode: text('shareCode') } : { documentType, seenHow: text('seenHow') }),
          permission: listA ? 'unlimited' : permission,
          ...(!listA && permission === 'time_limited' && text('permissionExpiresOn') ? { permissionExpiresOn: text('permissionExpiresOn') } : {}),
          restrictions: text('restrictions') || undefined,
          outcome,
          checkedOn: text('checkedOn'),
          notes: text('notes') || undefined,
          documentId,
        },
      });
    },
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });

  const latest = checks.data?.[0];
  const listA = method === 'manual_document' && RTW_DOCUMENTS[documentType].list === 'A';
  const pvn = method === 'manual_document' && documentType === 'positive_verification_notice';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    record.mutate(new FormData(event.currentTarget));
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Right to Work</h2>
        {canEdit && !open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Record a check
          </Button>
        )}
      </div>
      <ErrorAlert error={checks.error} />
      {checks.data && !latest && !open && <Alert tone="warning">No Right to Work check on file. They must not start work until one has passed.</Alert>}
      {latest && (
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={latest.outcome === 'passed' ? 'verified' : 'rejected'} />
            <span className="font-medium text-slate-900">
              {latest.methodLabel}
              {latest.documentLabel ? `: ${latest.documentLabel}` : ''}
              {latest.shareCodeEnding ? ` (share code …${latest.shareCodeEnding})` : ''}
            </span>
          </div>
          <p className="mt-1 text-slate-700">
            Checked {formatDate(latest.checkedOn)}
            {latest.checkedBy ? ` by ${latest.checkedBy.name}` : ''}
            {latest.seenHow ? ` (originals seen ${latest.seenHow === 'in_person' ? 'in person' : 'on a video call'})` : ''}.{' '}
            {latest.permission === 'unlimited' ? 'Permission has no time limit.' : `Time-limited permission${latest.permissionExpiresOn ? ` until ${formatDate(latest.permissionExpiresOn)}` : ''}.`}
          </p>
          {latest.followUpOn && <p className="mt-1 font-medium text-amber-800">Follow-up check due {formatDate(latest.followUpOn)}.</p>}
          {latest.restrictions && <p className="mt-1 text-slate-700">Restrictions: {latest.restrictions}</p>}
          {latest.notes && <p className="mt-1 text-slate-600">{latest.notes}</p>}
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <SelectField label="How did you check?" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="sm:col-span-2">
            <option value="share_code">Online, with their share code (gov.uk &ldquo;view a job applicant&rsquo;s right to work&rdquo;)</option>
            <option value="manual_document">Original documents (manual check)</option>
          </SelectField>

          {method === 'share_code' ? (
            <>
              <Field label="Share code" name="shareCode" required maxLength={11} placeholder="e.g. W2X 4YZ 7AB" autoComplete="off" />
              <SelectField label="Permission shown" value={permission} onChange={(e) => setPermission(e.target.value as typeof permission)}>
                <option value="unlimited">No time limit (e.g. settled status)</option>
                <option value="time_limited">Time-limited (e.g. visa, pre-settled)</option>
              </SelectField>
            </>
          ) : (
            <>
              <SelectField label="Document" value={documentType} onChange={(e) => setDocumentType(e.target.value as RtwDocumentType)} className="sm:col-span-2">
                {RTW_DOCUMENT_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {RTW_DOCUMENTS[d].label}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Originals seen" name="seenHow" defaultValue="in_person">
                <option value="in_person">In person, with the holder</option>
                <option value="video_call">On a live video call, originals in hand</option>
              </SelectField>
              {!listA && !pvn && (
                <SelectField label="Permission shown" value={permission} onChange={(e) => setPermission(e.target.value as typeof permission)}>
                  <option value="time_limited">Time-limited</option>
                  <option value="unlimited">No time limit</option>
                </SelectField>
              )}
            </>
          )}
          {!listA && !pvn && permission === 'time_limited' && <Field label="Permission ends on" name="permissionExpiresOn" type="date" required />}
          {pvn && <p className="text-sm text-slate-600 sm:col-span-2">A Positive Verification Notice is good for six months: we&rsquo;ll set the follow-up for you.</p>}
          <Field label="Date checked" name="checkedOn" type="date" required defaultValue={today()} max={today()} />
          <SelectField label="Result" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            <option value="passed">Passed: they can do this work</option>
            <option value="failed">Not passed</option>
          </SelectField>
          <Field label="Work restrictions (if any)" name="restrictions" maxLength={500} placeholder="e.g. 20 hours a week in term time" className="sm:col-span-2" />
          {can('documents:create') && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor="rtw-evidence" className="text-sm font-medium text-slate-700">
                Evidence (the online check result, or a copy of the documents)
              </label>
              <input id="rtw-evidence" type="file" name="evidence" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
              <p className="text-xs text-slate-500">Keep this for the whole time they work for you and two years after.</p>
            </div>
          )}
          <TextAreaField label="Notes (optional)" name="notes" maxLength={2000} rows={2} className="sm:col-span-2" />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? 'Saving…' : 'Save check'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
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
          <summary className="cursor-pointer text-slate-700">Earlier checks ({checks.data.length - 1})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-slate-600">
            {checks.data.slice(1).map((c) => (
              <li key={c.id}>
                {formatDate(c.checkedOn)}: {c.methodLabel}
                {c.documentLabel ? ` (${c.documentLabel})` : ''}, {c.outcome}
                {c.checkedBy ? `, by ${c.checkedBy.name}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
