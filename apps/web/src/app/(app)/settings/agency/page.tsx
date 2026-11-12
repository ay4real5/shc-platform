'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, PageHeader } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/lib/auth/auth-provider';

interface Agency {
  id: string;
  name: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  postcode: string | null;
  timezone: string;
}

const FIELDS = ['name', 'phone', 'addressLine1', 'addressLine2', 'town', 'postcode'] as const;

/** The agency profile claims are billed under (D-053). Admins edit; the timezone is fixed. */
export default function AgencySettingsPage() {
  const { request, can } = useAuth();
  const queryClient = useQueryClient();
  const agency = useQuery({
    queryKey: ['agency'],
    enabled: can('settings:read'),
    queryFn: async () => (await request<Agency>('/agency')).data,
  });
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => request<Agency>('/agency', { method: 'PATCH', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agency'] }),
  });

  if (!can('settings:read')) return <PageHeader title="Agency settings" subtitle="You don't have access to settings." />;
  const a = agency.data;
  const editable = can('settings:update');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, string> = {};
    for (const key of FIELDS) {
      const value = String(form.get(key) ?? '').trim();
      if (value && value !== (a?.[key] ?? '')) body[key] = value;
    }
    save.mutate(body);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Company settings" subtitle="Your company details, shown on emails and the careers page." />
      <ErrorAlert error={agency.error} />
      {a && (
        <Card className="p-5">
          <form key={JSON.stringify(a)} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" name="name" defaultValue={a.name} disabled={!editable} className="sm:col-span-2" />
            <Field label="Phone" name="phone" defaultValue={a.phone ?? ''} disabled={!editable} className="sm:col-span-2" />
            <Field label="Street address" name="addressLine1" defaultValue={a.addressLine1 ?? ''} disabled={!editable} className="sm:col-span-2" />
            <Field label="Address line 2" name="addressLine2" defaultValue={a.addressLine2 ?? ''} disabled={!editable} className="sm:col-span-2" />
            <Field label="Town or city" name="town" defaultValue={a.town ?? ''} disabled={!editable} />
            <Field label="Postcode" name="postcode" defaultValue={a.postcode ?? ''} disabled={!editable} hint="e.g. M1 1AA" />
            <p className="text-sm text-slate-600 sm:col-span-2">Timezone: {a.timezone}</p>
            {editable && (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <ErrorAlert error={save.error} />
                {save.isSuccess && <Alert tone="info">Saved.</Alert>}
                <div>
                  <Button type="submit" disabled={save.isPending}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Card>
      )}
    </div>
  );
}
