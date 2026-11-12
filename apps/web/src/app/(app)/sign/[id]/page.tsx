'use client';

import { useParams } from 'next/navigation';
import { SignForm, useMySignatureRequests } from '@/components/documents/signing';
import { Alert } from '@/components/ui/card';
import { ErrorAlert, PageHeader, formatDate } from '@/components/ui/data-display';

/** Read and sign a document you were sent (S2-04). */
export default function SignPage() {
  const { id } = useParams<{ id: string }>();
  const mine = useMySignatureRequests();
  if (mine.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  const r = mine.data?.find((x) => x.id === id);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ErrorAlert error={mine.error} />
      {!r && mine.data && <Alert>This document isn&rsquo;t waiting for your signature.</Alert>}
      {r && (
        <>
          <PageHeader title={r.document.title} subtitle={`Sent to you on ${formatDate(r.requestedAt)}${r.dueOn ? `, please sign by ${formatDate(r.dueOn)}` : ''}.`} />
          <SignForm request={r} />
        </>
      )}
    </div>
  );
}
