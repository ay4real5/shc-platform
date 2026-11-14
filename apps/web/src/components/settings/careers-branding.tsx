'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorAlert } from '@/components/ui/data-display';
import { useAuth } from '@/lib/auth/auth-provider';

/**
 * Careers page branding (S5-05, S-032): the company's own logo on its careers page, and a ready-made "Apply online"
 * link for its website (e.g. Support Health Care's "Join us" page), so applications land in SHC's tracker.
 */
export function CareersBranding({ logo, careersSlug, companyName, editable }: { logo: string | null; careersSlug: string | null; companyName: string; editable: boolean }) {
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<'link' | 'button' | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agency'] });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set('file', file);
      await request('/agency/logo', { method: 'PUT', body });
    },
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: () => request('/agency/logo', { method: 'DELETE' }), onSuccess: refresh });

  const url = careersSlug && typeof window !== 'undefined' ? `${window.location.origin}/careers/${careersSlug}` : null;
  const button = url
    ? `<a href="${url}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#4f7a31;color:#ffffff;font-weight:700;text-decoration:none">Apply online</a>`
    : '';
  const copy = (what: 'link' | 'button', text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('logo');
    if (file instanceof File && file.size) upload.mutate(file);
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Careers page</h2>
        <p className="text-sm text-slate-600">Your logo on your careers page, and a link for your own website so people can apply online.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-44 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small data: URL; nothing for next/image to optimise
            <img src={logo} alt={`${companyName} logo`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-500">No logo yet</span>
          )}
        </div>
        {editable && (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label htmlFor="careers-logo" className="text-sm font-medium text-slate-700">
              Upload your logo
            </label>
            <input id="careers-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" aria-describedby="careers-logo-hint" />
            <p id="careers-logo-hint" className="text-xs text-slate-600">
              PNG, JPEG or WebP, up to 200 KB. A wide logo on a white or clear background looks best.
            </p>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" disabled={upload.isPending}>
                {upload.isPending ? 'Uploading…' : 'Save logo'}
              </Button>
              {logo && (
                <Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  Remove
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
      <ErrorAlert error={upload.error ?? remove.error} />

      {url ? (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-canvas p-4">
          <p className="text-sm text-slate-700">
            Your careers page:{' '}
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 underline">
              {url} <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </p>
          <p className="text-sm text-slate-700">
            Ask whoever runs your website to put this button on your &ldquo;Join us&rdquo; or jobs page. Applications then come straight into Recruitment.
          </p>
          <code className="block overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">{button}</code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => copy('button', button)}>
              {copied === 'button' ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />} Copy button code
            </Button>
            <Button type="button" variant="ghost" onClick={() => copy('link', url)}>
              {copied === 'link' ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />} Copy link only
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Set a careers page address above to get your link.</p>
      )}
    </Card>
  );
}
