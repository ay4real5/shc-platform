'use client';

import { DISCIPLINES } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { SignatureRequest } from '@/components/documents/signing';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { SelectField } from '@/components/ui/form-controls';
import { useAuth } from '@/lib/auth/auth-provider';
import { disciplineLabel } from '@/lib/labels';
import type { StaffSummary } from '@/lib/types/people';

interface Doc {
  id: string;
  documentType: string;
  title: string;
  fileName: string;
  staffId: string | null;
  createdAt: string;
}

interface Pack {
  id: string;
  name: string;
  disciplines: string[];
  documents: { id: string; title: string }[];
}

const COMPANY_TYPES = [
  ['policy', 'Policy'],
  ['contract', 'Contract template'],
  ['other', 'Other'],
] as const;

/** Company documents (policies, handbook) people sign, and the onboarding packs that send them by job role (S2-04). */
export default function DocumentsPage() {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const manage = can('documents:create');
  const docs = useQuery({
    queryKey: ['documents', 'company'],
    queryFn: async () => (await request<Doc[]>('/documents?limit=100')).data.filter((d) => !d.staffId),
  });
  const staff = useQuery({
    queryKey: ['staff', 'active-all'],
    enabled: manage,
    queryFn: async () => (await request<StaffSummary[]>('/staff?isActive=true&limit=100')).data,
  });
  const upload = useMutation({
    mutationFn: async (form: FormData) => request('/documents', { method: 'POST', body: form }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    upload.mutate(new FormData(formEl), { onSuccess: () => formEl.reset() });
  };

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader title="Documents" subtitle="Policies and contracts your staff read and sign online." />
      {manage && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Add a company document</h2>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <Field label="Title" name="title" required maxLength={255} placeholder="e.g. Safeguarding policy" />
            <SelectField label="Type" name="documentType" defaultValue="policy">
              {COMPANY_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
            <div className="flex flex-col gap-1">
              <label htmlFor="doc-file" className="text-sm font-medium text-slate-700">
                File (PDF)
              </label>
              <input id="doc-file" type="file" name="file" required accept="application/pdf" className="text-sm" />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={upload.isPending}>
                Upload
              </Button>
              <ErrorAlert error={upload.error} />
            </div>
          </form>
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">Company documents</h2>
        <ErrorAlert error={docs.error} />
        {docs.data?.length === 0 && <p className="text-sm text-slate-500">No company documents yet.</p>}
        <ul className="flex flex-col gap-3">
          {docs.data?.map((d) => (
            <DocumentRow key={d.id} doc={d} staff={staff.data ?? []} manage={manage} />
          ))}
        </ul>
      </Card>

      <PacksCard docs={docs.data ?? []} manage={manage} />
    </div>
  );
}

function DocumentRow({ doc, staff, manage }: { doc: Doc; staff: StaffSummary[]; manage: boolean }) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const who = useQuery({
    queryKey: ['documents', doc.id, 'signatures'],
    enabled: showWho,
    queryFn: async () => (await request<SignatureRequest[]>(`/documents/${doc.id}/signature-requests`)).data,
  });
  const send = useMutation({
    mutationFn: (staffIds: string[]) => request<{ created: number; alreadyAsked: number }>(`/documents/${doc.id}/signature-requests`, { method: 'POST', body: { staffIds } }),
    onSuccess: async () => {
      setSending(false);
      await queryClient.invalidateQueries({ queryKey: ['documents', doc.id] });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ids = form.get('everyone') === 'on' ? staff.map((s) => s.id) : form.getAll('staffIds').map(String);
    if (ids.length) send.mutate(ids);
  };

  const live = who.data?.filter((r) => r.status !== 'cancelled') ?? [];
  return (
    <li className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium text-slate-900">{doc.title}</span>
          <span className="text-slate-500"> · added {formatDate(doc.createdAt)}</span>
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowWho((v) => !v)}>
            {showWho ? 'Hide' : 'Who has signed'}
          </Button>
          {manage && !sending && (
            <Button variant="secondary" onClick={() => setSending(true)}>
              Send to sign
            </Button>
          )}
        </div>
      </div>
      {send.data && (
        <p className="mt-2 text-slate-700">
          Sent to {send.data.data.created}.{send.data.data.alreadyAsked ? ` ${send.data.data.alreadyAsked} already had it.` : ''}
        </p>
      )}
      {sending && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="everyone" className="size-4 rounded border-slate-300" /> Everyone active ({staff.length})
          </label>
          <fieldset className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
            <legend className="px-1 text-xs text-slate-500">Or choose people</legend>
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" name="staffIds" value={s.id} className="size-4 rounded border-slate-300" />
                {s.firstName} {s.lastName} <span className="text-slate-500">({disciplineLabel(s.discipline)})</span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={send.isPending}>
              Send
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSending(false)}>
              Cancel
            </Button>
          </div>
          <ErrorAlert error={send.error} />
        </form>
      )}
      {showWho && (
        <div className="mt-2">
          {who.isLoading && <p className="text-slate-500">Loading…</p>}
          {who.data && (
            <p className="text-slate-700">
              {live.filter((r) => r.status === 'signed').length} of {live.length} signed.
              {live.some((r) => r.status === 'pending') && (
                <> Waiting for: {live.filter((r) => r.status === 'pending').map((r) => `${r.staff.firstName} ${r.staff.lastName}`).join(', ')}.</>
              )}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function PacksCard({ docs, manage }: { docs: Doc[]; manage: boolean }) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const packs = useQuery({ queryKey: ['onboarding-packs'], queryFn: async () => (await request<Pack[]>('/onboarding-packs')).data });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['onboarding-packs'] });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => request('/onboarding-packs', { method: 'POST', body }),
    onSuccess: async () => {
      setAdding(false);
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => request(`/onboarding-packs/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({ name: String(form.get('name') ?? '').trim(), disciplines: form.getAll('disciplines').map(String), documentIds: form.getAll('documentIds').map(String) });
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Onboarding packs</h2>
          <p className="text-sm text-slate-600">Sent automatically to every new hire in the chosen job roles.</p>
        </div>
        {manage && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)} disabled={!docs.length}>
            New pack
          </Button>
        )}
      </div>
      <ErrorAlert error={packs.error ?? remove.error} />
      {packs.data?.length === 0 && !adding && <Alert tone="info">No packs yet. Upload your policies above, then make a pack for each group of job roles.</Alert>}
      <ul className="flex flex-col gap-2 text-sm">
        {packs.data?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 p-3">
            <span>
              <span className="font-medium text-slate-900">{p.name}</span>
              <span className="text-slate-500"> · {p.disciplines.length ? p.disciplines.map(disciplineLabel).join(', ') : 'everyone'}</span>
              <br />
              <span className="text-slate-700">{p.documents.map((d) => d.title).join(', ') || 'No documents'}</span>
            </span>
            {manage && (
              <Button variant="ghost" onClick={() => window.confirm(`Delete the pack "${p.name}"? Documents already sent stay sent.`) && remove.mutate(p.id)}>
                Delete
              </Button>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
          <Field label="Pack name" name="name" required maxLength={150} placeholder="e.g. Care workers" />
          <fieldset className="grid gap-1 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-medium text-slate-700">Job roles (none ticked = everyone)</legend>
            {DISCIPLINES.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="disciplines" value={d} className="size-4 rounded border-slate-300" /> {disciplineLabel(d)}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-1 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Documents</legend>
            {docs.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="documentIds" value={d.id} className="size-4 rounded border-slate-300" /> {d.title}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending}>
              Save pack
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <ErrorAlert error={create.error} />
        </form>
      )}
    </Card>
  );
}
