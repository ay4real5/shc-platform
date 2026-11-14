'use client';

import { registerFor, registrationNumberProblem } from '@alora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { ErrorAlert, StatusBadge, formatDate } from '@/components/ui/data-display';
import { Field } from '@/components/ui/field';
import { useAuth } from '@/lib/auth/auth-provider';

interface Credential {
  id: string;
  credentialType: string;
  credentialNumber: string | null;
  expiryDate: string | null;
  status: string;
  state: 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';
  verifiedAt: string | null;
}

/**
 * Professional registration (S5-01, S-027): nurses (NMC), allied health professionals (HCPC) and doctors (GMC) must be
 * on their register to work. The manager looks them up on the public register, then records the number, the renewal
 * date and that they checked. Stored as the role's register credential, so expiry alerts and the inspection pack use it.
 */
export function RegistrationPanel({ staffId, discipline, canEdit }: { staffId: string; discipline: string; canEdit: boolean }) {
  const register = registerFor(discipline);
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const credentials = useQuery({
    queryKey: ['staff', staffId, 'credentials'],
    enabled: Boolean(register),
    queryFn: async () => (await request<Credential[]>(`/staff/${staffId}/credentials`)).data,
  });
  const record = useMutation({
    mutationFn: (body: Record<string, unknown>) => request(`/staff/${staffId}/credentials`, { method: 'POST', body }),
    onSuccess: async () => {
      setAdding(false);
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });
  if (!register) return null;

  const current = credentials.data?.find((c) => c.credentialType === register.type && c.status === 'active');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = String(form.get('number') ?? '').trim();
    const found = problem ?? registrationNumberProblem(register.type, number);
    if (found) {
      setProblem(found);
      return;
    }
    record.mutate({
      credentialType: register.type,
      credentialName: register.label,
      credentialNumber: number,
      issuingAuthority: register.bodyName,
      expiryDate: String(form.get('expiryDate') ?? '') || undefined,
      alertDaysBefore: 60,
      verified: form.get('checked') === 'on',
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Professional registration ({register.body})</h2>
        {canEdit && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {current ? 'Record a new check' : `Add ${register.numberLabel}`}
          </Button>
        )}
      </div>
      <ErrorAlert error={credentials.error} />
      {credentials.data && !current && !adding && (
        <Alert tone="warning">
          No {register.label} on file. They must not work as a registered professional until you have checked the {register.body} register.
        </Alert>
      )}
      {current && (
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={current.state === 'expired' ? 'expired' : current.verifiedAt ? 'verified' : 'pending'} />
            <span className="font-medium text-slate-900">{register.numberLabel}</span>
            <span className="tabular-nums tracking-wide text-slate-700">{current.credentialNumber ?? 'not recorded'}</span>
          </div>
          <p className="mt-1 text-slate-700">
            {current.verifiedAt ? `Checked on the ${register.body} register ${formatDate(current.verifiedAt.slice(0, 10))}.` : `Not checked on the ${register.body} register yet.`}
            {current.expiryDate ? ` Renews ${formatDate(current.expiryDate)}.` : ' No renewal date recorded.'}
          </p>
          {current.state === 'expired' && <p className="mt-1 font-medium text-rose-800">Lapsed: they must not work as a registered professional until it is renewed.</p>}
          {current.state === 'expiring_soon' && <p className="mt-1 font-medium text-amber-800">Renews soon: check the register again once it has.</p>}
        </div>
      )}

      {adding && (
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
          <p className="text-sm text-slate-600 sm:col-span-2">
            Look them up on the{' '}
            <a href={register.registerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 underline">
              {register.bodyName} register <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            , check the name matches and there are no conditions or suspensions, then record it here.
          </p>
          <Field
            label={register.numberLabel}
            name="number"
            required
            maxLength={20}
            hint={`e.g. ${register.example}`}
            error={problem ?? undefined}
            onChange={() => setProblem(null)}
          />
          <Field label="Renewal date" name="expiryDate" type="date" hint={register.renewalHelp} />
          <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" name="checked" defaultChecked className="mt-0.5 h-4 w-4 accent-brand-600" />
            I have checked the {register.body} register today and they are registered with no restrictions that stop this work.
          </label>
          <ErrorAlert error={record.error} />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
