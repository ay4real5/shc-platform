'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/lib/auth/auth-provider';

export interface SignatureRequest {
  id: string;
  document: { id: string; title: string; documentType: string; personal: boolean };
  staff: { id: string; firstName: string; lastName: string };
  status: 'pending' | 'signed' | 'cancelled' | string;
  dueOn: string | null;
  requestedAt: string;
  signedAt: string | null;
  signedName: string | null;
}

export function useMySignatureRequests() {
  const { request } = useAuth();
  return useQuery({ queryKey: ['signature-requests', 'mine'], queryFn: async () => (await request<SignatureRequest[]>('/signature-requests/mine')).data });
}

/** Opens the document the person was asked to sign in a new tab (fetched with their session, shown as a blob). */
export function useOpenDocument() {
  const { request } = useAuth();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const tab = window.open('', '_blank');
      const { data } = await request<Blob>(`/signature-requests/${requestId}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });
}

/** Home page card: what I still need to sign. Hidden when there's nothing. */
export function ToSignCard() {
  const mine = useMySignatureRequests();
  const pending = mine.data?.filter((r) => r.status === 'pending') ?? [];
  if (!pending.length) return null;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <FileSignature aria-hidden className="h-5 w-5 text-accent-600" /> Documents to sign ({pending.length})
      </h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {pending.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium text-slate-900">{r.document.title}</span>
              {r.dueOn && <span className="text-slate-500"> · by {formatDate(r.dueOn)}</span>}
            </span>
            <ButtonLink href={`/sign/${r.id}`} variant="accent">
              Read and sign
            </ButtonLink>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Read and sign one document. */
export function SignForm({ request: r }: { request: SignatureRequest }) {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const open = useOpenDocument();
  const [opened, setOpened] = useState(false);
  const sign = useMutation({
    mutationFn: (body: { typedName: string; agreed: boolean }) => request(`/signature-requests/${r.id}/sign`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signature-requests'] }),
  });

  if (r.status === 'signed' || sign.isSuccess) {
    return (
      <Alert tone="info">
        Signed{r.signedAt ? ` on ${formatDate(r.signedAt)}` : ''}. Thank you.{' '}
        <Link href="/" className="font-medium underline">
          Back to the home page
        </Link>
      </Alert>
    );
  }
  if (r.status !== 'pending') return <Alert>This request was cancelled.</Alert>;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    sign.mutate({ typedName: String(form.get('typedName') ?? '').trim(), agreed: form.get('agreed') === 'on' });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            setOpened(true);
            open.mutate(r.id);
          }}
        >
          Open the document
        </Button>
        <ErrorAlert error={open.error} />
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Type your full name to sign" name="typedName" required maxLength={200} defaultValue={user ? `${user.firstName} ${user.lastName}` : ''} autoComplete="name" />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="agreed" required className="mt-0.5 size-4 rounded border-slate-300" />
          <span>I have read &ldquo;{r.document.title}&rdquo; and agree to it. I understand typing my name is my signature.</span>
        </label>
        {!opened && <p className="text-xs text-slate-500">Please open and read the document before you sign.</p>}
        <div>
          <Button type="submit" variant="accent" disabled={sign.isPending}>
            {sign.isPending ? 'Signing…' : 'Sign'}
          </Button>
        </div>
        <ErrorAlert error={sign.error} />
      </form>
    </Card>
  );
}

/** Staff page: their contracts and policies, with the office's send actions. */
export function StaffDocumentsPanel({ staffId }: { staffId: string }) {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const list = useQuery({
    queryKey: ['staff', staffId, 'signature-requests'],
    queryFn: async () => (await request<SignatureRequest[]>(`/staff/${staffId}/signature-requests`)).data,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff'] });
  const pack = useMutation({
    mutationFn: () => request<{ created: number; alreadyAsked: number }>(`/staff/${staffId}/onboarding-pack`, { method: 'POST', body: {} }),
    onSuccess: refresh,
  });
  const contract = useMutation({
    mutationFn: async (form: FormData) => {
      const upload = new FormData();
      upload.set('file', form.get('file') as File);
      upload.set('documentType', 'contract');
      upload.set('title', String(form.get('title') ?? 'Contract of employment'));
      upload.set('staffId', staffId);
      const { data } = await request<{ id: string }>('/documents', { method: 'POST', body: upload });
      await request(`/documents/${data.id}/signature-requests`, { method: 'POST', body: { staffIds: [staffId] } });
    },
    onSuccess: async () => {
      setUploading(false);
      await refresh();
    },
  });
  const manage = can('documents:create');

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Contracts and policies</h2>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={pack.isPending} onClick={() => pack.mutate()}>
              Send onboarding pack
            </Button>
            {!uploading && (
              <Button variant="secondary" onClick={() => setUploading(true)}>
                Upload a contract to sign
              </Button>
            )}
          </div>
        )}
      </div>
      {pack.data && (
        <Alert tone="info">
          {pack.data.data.created
            ? `Sent ${pack.data.data.created} document${pack.data.data.created === 1 ? '' : 's'} to sign.`
            : pack.data.data.alreadyAsked
              ? 'They already have everything in their onboarding pack.'
              : 'No onboarding pack matches their job role yet. Set packs up on the Documents page.'}
        </Alert>
      )}
      <ErrorAlert error={list.error ?? pack.error} />
      {uploading && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            contract.mutate(new FormData(e.currentTarget));
          }}
          className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"
        >
          <Field label="Title" name="title" required maxLength={255} defaultValue="Contract of employment" />
          <div className="flex flex-col gap-1">
            <label htmlFor="contract-file" className="text-sm font-medium text-slate-700">
              File (PDF)
            </label>
            <input id="contract-file" type="file" name="file" required accept="application/pdf" className="text-sm" />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={contract.isPending}>
              Upload and send to sign
            </Button>
            <Button type="button" variant="ghost" onClick={() => setUploading(false)}>
              Cancel
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorAlert error={contract.error} />
          </div>
        </form>
      )}
      {list.data?.length === 0 && <p className="text-sm text-slate-500">Nothing sent to sign yet.</p>}
      <ul className="divide-y divide-slate-100 text-sm">
        {list.data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium text-slate-900">{r.document.title}</span>
              <span className="text-slate-500"> · sent {formatDate(r.requestedAt)}</span>
              {r.signedAt && <span className="text-slate-500"> · signed {formatDate(r.signedAt)} as &ldquo;{r.signedName}&rdquo;</span>}
            </span>
            <StatusBadge status={r.status === 'signed' ? 'signed' : 'pending'} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
